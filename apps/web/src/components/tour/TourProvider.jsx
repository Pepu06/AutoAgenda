'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import STEPS from './steps';
import styles from './tour.module.css';

const STORAGE_KEY   = 'autoagenda_tour_step';
const ACTIVE_KEY    = 'autoagenda_tour_active';
const DISMISSED_KEY = 'autoagenda_tour_dismissed';

const TourContext = createContext(null);

export function useTour() {
  return useContext(TourContext);
}

// ────────────────────────────────────────────────────────
// Popover positioning
// ────────────────────────────────────────────────────────
function computePopoverStyle(rect, position, popoverWidth = 320, popoverHeight = 200) {
  if (!rect || position === 'center') return null;

  const GAP = 16;
  const winW = window.innerWidth;
  const winH = window.innerHeight;

  let top, left, placement = position;

  if (position === 'bottom') {
    top  = rect.bottom + GAP;
    left = rect.left;
    if (top + popoverHeight > winH - GAP) { top = rect.top - popoverHeight - GAP; placement = 'top'; }
  } else if (position === 'top') {
    top  = rect.top - popoverHeight - GAP;
    left = rect.left;
    if (top < GAP) { top = rect.bottom + GAP; placement = 'bottom'; }
  } else if (position === 'right') {
    left = rect.right + GAP;
    top  = rect.top;
    if (left + popoverWidth > winW - GAP) { left = rect.left - popoverWidth - GAP; placement = 'left'; }
  } else if (position === 'left') {
    left = rect.left - popoverWidth - GAP;
    top  = rect.top;
    if (left < GAP) { left = rect.right + GAP; placement = 'right'; }
  }

  // Hard clamp — always keep popover fully on screen
  top  = Math.max(GAP, Math.min(top,  winH - popoverHeight - GAP));
  left = Math.max(GAP, Math.min(left, winW - popoverWidth  - GAP));

  return { style: { top, left }, placement };
}

// ────────────────────────────────────────────────────────
// Provider
// ────────────────────────────────────────────────────────
export function TourProvider({ children }) {
  const router   = useRouter();
  const pathname = usePathname();

  const [isActive,          setIsActive]          = useState(false);
  const [stepIndex,         setStepIndex]         = useState(0);
  const [targetRect,        setTargetRect]        = useState(null);
  const [popoverPos,        setPopoverPos]        = useState(null);
  const [popoverReady,      setPopoverReady]      = useState(false);
  // true when the element wasn't found and we fall back to centered display
  const [fallbackCentered,  setFallbackCentered]  = useState(false);

  const prevHighlightRef = useRef(null);
  const popoverRef       = useRef(null);

  // Refs so the pathname effect always reads the latest values (no stale closure)
  const isActiveRef  = useRef(false);
  const stepIndexRef = useRef(0);
  isActiveRef.current  = isActive;
  stepIndexRef.current = stepIndex;

  const step = STEPS[stepIndex] ?? null;

  // ── Persist / restore ───────────────────────────────
  function persist(idx) {
    localStorage.setItem(STORAGE_KEY, String(idx));
    localStorage.setItem(ACTIVE_KEY,  'true');
  }

  function clearPersist() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ACTIVE_KEY);
  }

  // ── Remove highlight from previous element ──────────
  function removeHighlight() {
    if (prevHighlightRef.current) {
      prevHighlightRef.current.classList.remove('tour-highlight');
      prevHighlightRef.current = null;
    }
  }

  // ── Show step: wait for element then position popover ──
  const showStep = useCallback((idx) => {
    const s = STEPS[idx];
    if (!s) return;

    setStepIndex(idx);
    setPopoverReady(false);
    setTargetRect(null);
    setPopoverPos(null);
    setFallbackCentered(false);
    persist(idx);
    removeHighlight();

    // No selector → show centered immediately
    if (!s.selector) {
      setPopoverReady(true);
      return;
    }

    // Poll for the element (up to 4 s, covers page loading spinners)
    let attempts = 0;
    const MAX = 40;

    const tick = () => {
      const el = document.querySelector(s.selector);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
          const r = el.getBoundingClientRect();
          el.classList.add('tour-highlight');
          prevHighlightRef.current = el;
          setTargetRect(r);
          setPopoverReady(true);
        }, 350);
      } else if (attempts < MAX) {
        attempts++;
        setTimeout(tick, 100);
      } else {
        // Element not found — show popover centered (no highlight)
        setFallbackCentered(true);
        setPopoverReady(true);
      }
    };
    tick();
  }, []);

  // ── Route change: re-attach highlight after navigation ──
  // Uses refs to avoid reading stale stepIndex / isActive values
  useEffect(() => {
    if (!isActiveRef.current) return;
    const idx = stepIndexRef.current;
    const s = STEPS[idx];
    if (!s) return;
    if (s.route && pathname !== s.route) {
      router.push(s.route);
    } else {
      showStep(idx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // ── Start / resume tour ─────────────────────────────
  const startTour = useCallback((idx = 0) => {
    const targetIdx = idx ?? 0;
    setIsActive(true);
    const s = STEPS[targetIdx];
    if (s?.route && pathname !== s.route) {
      persist(targetIdx);
      setStepIndex(targetIdx);
      router.push(s.route);
    } else {
      showStep(targetIdx);
    }
  }, [pathname, router, showStep]);

  // ── Auto-start / resume on mount ───────────────────
  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISSED_KEY) === 'true';
    const wasActive = localStorage.getItem(ACTIVE_KEY) === 'true';
    const savedIdx  = parseInt(localStorage.getItem(STORAGE_KEY) ?? '0', 10);

    // Resume in-progress tour (mid-tour page reload)
    if (wasActive && !dismissed) {
      setIsActive(true);
      showStep(Number.isNaN(savedIdx) ? 0 : savedIdx);
      return;
    }

    if (dismissed) return;

    // First visit: check backend
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) return;

    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/settings/onboarding`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(res => {
        if (res.data?.completed === false) {
          setIsActive(true);
          showStep(0);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Re-compute popover position after mount / resize ──
  useEffect(() => {
    if (!popoverReady || !targetRect) return;
    const ph = popoverRef.current?.offsetHeight || 220;
    const pw = popoverRef.current?.offsetWidth  || 320;
    const result = computePopoverStyle(targetRect, step?.position, pw, ph);
    setPopoverPos(result);
  }, [popoverReady, targetRect, step]);

  // ── Navigation ──────────────────────────────────────
  function next() {
    const nextIdx = stepIndex + 1;
    if (nextIdx >= STEPS.length) { completeTour(); return; }
    const nextStep = STEPS[nextIdx];
    if (nextStep.route && pathname !== nextStep.route) {
      removeHighlight();
      persist(nextIdx);
      setStepIndex(nextIdx);
      setPopoverReady(false);
      router.push(nextStep.route);
    } else {
      showStep(nextIdx);
    }
  }

  function back() {
    if (stepIndex === 0) return;
    const prevIdx  = stepIndex - 1;
    const prevStep = STEPS[prevIdx];
    removeHighlight();
    if (prevStep.route && pathname !== prevStep.route) {
      persist(prevIdx);
      setStepIndex(prevIdx);
      setPopoverReady(false);
      router.push(prevStep.route);
    } else {
      showStep(prevIdx);
    }
  }

  function dismissTour() {
    removeHighlight();
    clearPersist();
    localStorage.setItem(DISMISSED_KEY, 'true');
    setIsActive(false);
    setPopoverReady(false);
  }

  function completeTour() {
    removeHighlight();
    clearPersist();
    setIsActive(false);
    setPopoverReady(false);
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/settings/onboarding`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') : ''}`,
      },
      body: JSON.stringify({ completed: true }),
    }).catch(() => {});
  }

  function restartTour() {
    localStorage.removeItem(DISMISSED_KEY);
    startTour(0);
  }

  const totalVisible   = STEPS.filter(s => s.id !== 'welcome' && s.id !== 'done').length;
  const currentVisible = Math.max(0, stepIndex - 1);

  // A step is "anchored" when it has a selector AND we found the element (not fallback)
  const isAnchored = step?.selector && !fallbackCentered;

  return (
    <TourContext.Provider value={{ isActive, startTour, restartTour, dismissTour, stepIndex }}>
      {children}

      {isActive && popoverReady && step && (
        <>
          {/* Backdrop for centered/fallback steps — only dismissible when step has no selector (welcome/done) */}
          {!isAnchored && <div className={styles.backdrop} onClick={step?.selector ? undefined : dismissTour} />}

          <div
            ref={popoverRef}
            className={`${styles.popover} ${!isAnchored ? styles.popoverCentered : ''}`}
            style={
              isAnchored
                ? (popoverPos ? popoverPos.style : { visibility: 'hidden' })
                : undefined
            }
          >
            {/* Arrow — only when anchored and positioned */}
            {isAnchored && popoverPos && (
              <div className={`${styles.arrow} ${
                popoverPos.placement === 'bottom' ? styles.arrowBottom :
                popoverPos.placement === 'top'    ? styles.arrowTop    :
                popoverPos.placement === 'left'   ? styles.arrowLeft   :
                                                     styles.arrowRight
              }`} />
            )}

            {step.id !== 'welcome' && step.id !== 'done' && (
              <div className={styles.stepBadge}>Paso {currentVisible} de {totalVisible}</div>
            )}
            <h3 className={styles.title}>{step.title}</h3>
            <p className={styles.text}>{step.text}</p>

            <div className={styles.footer}>
              <span className={styles.progress}>
                {Math.round((stepIndex / (STEPS.length - 1)) * 100)}%
              </span>

              {step.canSkip !== false && stepIndex > 0 && (
                <button className={styles.btnSkip} onClick={dismissTour}>Saltar tour</button>
              )}

              {stepIndex > 0 && step.id !== 'done' && (
                <button className={styles.btnBack} onClick={back}>Atrás</button>
              )}

              {step.id === 'done' ? (
                <button className={styles.btnNext} onClick={completeTour}>¡Empezar! 🚀</button>
              ) : (
                <button className={styles.btnNext} onClick={next}>
                  {step.id === 'welcome' ? 'Comenzar' : 'Siguiente →'}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </TourContext.Provider>
  );
}
