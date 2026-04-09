export const metadata = {
  title: 'TuAutoAgenda',
};

export default function BookLayout({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f7', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {children}
    </div>
  );
}
