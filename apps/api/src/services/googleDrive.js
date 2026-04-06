const env = require('../config/env');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

async function getDriveAccessToken() {
  if (!env.GOOGLE_DRIVE_REFRESH_TOKEN) {
    throw new Error('GOOGLE_DRIVE_REFRESH_TOKEN is not configured');
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_DRIVE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || 'Could not get Google Drive access token');
  }

  return data.access_token;
}

async function findFolderByName(accessToken, name) {
  const q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const params = new URLSearchParams({
    q,
    pageSize: '1',
    fields: 'files(id,name)',
  });

  const res = await fetch(`${DRIVE_API_BASE}/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error?.message || 'Could not search AutoAgenda folder');
  }

  return data?.files?.[0] || null;
}

async function createFolder(accessToken, name) {
  const res = await fetch(`${DRIVE_API_BASE}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Could not create AutoAgenda folder');
  }

  return data;
}

async function getAutoAgendaFolderId(accessToken) {
  if (env.GOOGLE_DRIVE_FOLDER_ID) return env.GOOGLE_DRIVE_FOLDER_ID;

  const existing = await findFolderByName(accessToken, 'AutoAgenda');
  if (existing?.id) return existing.id;

  const created = await createFolder(accessToken, 'AutoAgenda');
  return created.id;
}

async function makeFilePublic(accessToken, fileId) {
  await fetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      role: 'reader',
      type: 'anyone',
    }),
  });
}

function buildPreviewUrl(fileId) {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1600`;
}

async function uploadPaymentProof({ tenantId, tenantName, tenantEmail, plan, mimeType, base64Data }) {
  const accessToken = await getDriveAccessToken();
  const folderId = await getAutoAgendaFolderId(accessToken);

  const ext = mimeType?.split('/')[1] || 'jpg';
  const safePlan = (plan || 'unknown').toLowerCase();
  const safeTenant = (tenantName || tenantId || 'tenant').replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 40);
  const fileName = `proof_${safePlan}_${safeTenant}_${Date.now()}.${ext}`;

  const metadata = {
    name: fileName,
    parents: [folderId],
    appProperties: {
      autoagendaType: 'paymentProof',
      tenantId: String(tenantId || ''),
      tenantName: String(tenantName || ''),
      tenantEmail: String(tenantEmail || ''),
      plan: String(plan || ''),
      status: 'pending',
    },
  };

  const boundary = `autoagenda_${Date.now()}`;
  const fileBuffer = Buffer.from(base64Data, 'base64');

  const multipartBody = Buffer.concat([
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from('Content-Type: application/json; charset=UTF-8\r\n\r\n'),
    Buffer.from(JSON.stringify(metadata)),
    Buffer.from(`\r\n--${boundary}\r\n`),
    Buffer.from(`Content-Type: ${mimeType}\r\n\r\n`),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const uploadRes = await fetch(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,webViewLink,createdTime`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  const uploaded = await uploadRes.json();
  if (!uploadRes.ok) {
    throw new Error(uploaded?.error?.message || 'Could not upload payment proof to Google Drive');
  }

  await makeFilePublic(accessToken, uploaded.id);

  return {
    id: uploaded.id,
    name: uploaded.name,
    createdTime: uploaded.createdTime,
    webViewLink: uploaded.webViewLink,
    imageUrl: buildPreviewUrl(uploaded.id),
  };
}

async function listPaymentProofs() {
  const accessToken = await getDriveAccessToken();
  const folderId = await getAutoAgendaFolderId(accessToken);

  const q = [
    `'${folderId}' in parents`,
    'trashed = false',
    "appProperties has { key='autoagendaType' and value='paymentProof' }",
    "appProperties has { key='status' and value='pending' }",
  ].join(' and ');

  const params = new URLSearchParams({
    q,
    pageSize: '200',
    orderBy: 'createdTime desc',
    fields: 'files(id,name,createdTime,webViewLink,appProperties)',
  });

  const res = await fetch(`${DRIVE_API_BASE}/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Could not list payment proofs from Google Drive');
  }

  return (data.files || []).map((file) => ({
    id: file.id,
    tenantId: file.appProperties?.tenantId || '',
    tenantName: file.appProperties?.tenantName || 'Sin nombre',
    tenantEmail: file.appProperties?.tenantEmail || '—',
    plan: file.appProperties?.plan || '—',
    createdAt: file.createdTime,
    imageUrl: buildPreviewUrl(file.id),
    webViewLink: file.webViewLink,
    fileName: file.name,
  }));
}

async function getPaymentProofById(fileId) {
  const accessToken = await getDriveAccessToken();
  const res = await fetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?fields=id,name,createdTime,webViewLink,appProperties`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Could not fetch payment proof from Google Drive');
  }

  return {
    id: data.id,
    tenantId: data.appProperties?.tenantId || '',
    tenantName: data.appProperties?.tenantName || 'Sin nombre',
    tenantEmail: data.appProperties?.tenantEmail || '—',
    plan: data.appProperties?.plan || '—',
    createdAt: data.createdTime,
    webViewLink: data.webViewLink,
    imageUrl: buildPreviewUrl(data.id),
    fileName: data.name,
  };
}

async function updatePaymentProofStatus(fileId, status) {
  const accessToken = await getDriveAccessToken();

  const res = await fetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?fields=id`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      appProperties: {
        status: status, // 'approved' or 'rejected'
      },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Could not update payment proof status');
  }

  return data;
}

module.exports = {
  uploadPaymentProof,
  listPaymentProofs,
  getPaymentProofById,
  updatePaymentProofStatus,
  async downloadPaymentProof(fileId) {
    const accessToken = await getDriveAccessToken();

    const metadataRes = await fetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?fields=id,mimeType,name`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const metadata = await metadataRes.json();
    if (!metadataRes.ok) {
      throw new Error(metadata?.error?.message || 'Could not fetch payment proof metadata from Google Drive');
    }

    const fileRes = await fetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!fileRes.ok) {
      let details = 'Could not download payment proof from Google Drive';
      try {
        const errJson = await fileRes.json();
        details = errJson?.error?.message || details;
      } catch {
        // ignore parse errors
      }
      throw new Error(details);
    }

    const arrayBuffer = await fileRes.arrayBuffer();
    return {
      mimeType: metadata.mimeType || 'application/octet-stream',
      fileName: metadata.name || `proof_${fileId}`,
      buffer: Buffer.from(arrayBuffer),
    };
  },
};
