/* drive.js — cópia de segurança no Google Drive.
 *
 * O Client ID é o mesmo do Caderno de Leitura: as origens autorizadas são o
 * domínio nu (https://forte3dvfx-code.github.io), por isso serve para
 * qualquer app no mesmo github.io, sem tocar na Cloud Console.
 * O Client ID NÃO é secreto: fica visível no código e não faz mal, porque
 * está preso ao teu domínio. Não confundir com "client secret", que não usamos. */

const DRIVE_CLIENT_ID = '110359919647-5mtubvedf2omr1b325t0aqcnccdq4es4.apps.googleusercontent.com';

/* Só ficheiros criados por esta app. O resto do Drive fica invisível —
 * é também o que evita a revisão demorada da Google. */
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const DRIVE_FOLDER = 'Treino';
const DRIVE_FILENAME = 'treino-backup.json';

let tokenClient = null;
let accessToken = null;
let tokenExpiry = 0;

function driveConfigured() {
  return DRIVE_CLIENT_ID.indexOf('COLA-AQUI') === -1;
}

/* A biblioteca da Google carrega-se só quando é precisa. Assim a app
 * continua a abrir sem rede — o Drive é que fica indisponível. */
function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      return resolve();
    }
    const existing = document.getElementById('gis-script');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Sem ligação à Google.')));
      return;
    }
    const s = document.createElement('script');
    s.id = 'gis-script';
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Sem ligação à Google.'));
    document.head.appendChild(s);
  });
}

/* interactive = true mostra o ecrã de autorização.
 * false tenta em silêncio, usando a sessão que já existe no browser. */
async function getAccessToken(interactive) {
  if (!driveConfigured()) throw new Error('Falta configurar o Client ID no drive.js.');

  // O token dura uma hora. Renova-se um minuto antes de expirar.
  if (accessToken && Date.now() < tokenExpiry - 60000) return accessToken;

  await loadGoogleScript();

  return new Promise((resolve, reject) => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: DRIVE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (resp) => {
        if (resp.error) return reject(new Error(resp.error));
        accessToken = resp.access_token;
        tokenExpiry = Date.now() + ((resp.expires_in || 3600) * 1000);
        resolve(accessToken);
      },
      error_callback: (err) => {
        reject(new Error(err && err.type ? err.type : 'Autorização recusada.'));
      }
    });
    tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
  });
}

async function driveFetch(url, options) {
  const token = await getAccessToken(false);
  const opts = options || {};
  opts.headers = Object.assign({}, opts.headers, { Authorization: 'Bearer ' + token });

  const resp = await fetch(url, opts);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error('Drive respondeu ' + resp.status + ': ' + text.slice(0, 120));
  }
  return resp;
}

/* Procura a pasta; se não existir, cria. O id fica guardado para as
 * próximas vezes, mas revalida-se caso a pasta tenha sido apagada. */
async function ensureFolder() {
  const saved = await DB.getSetting('driveFolderId', null);
  if (saved) {
    try {
      await driveFetch('https://www.googleapis.com/drive/v3/files/' + saved + '?fields=id,trashed');
      return saved;
    } catch (e) {
      // Apagada ou inacessível: cai para a criação abaixo.
    }
  }

  const q = encodeURIComponent(
    "name='" + DRIVE_FOLDER + "' and mimeType='application/vnd.google-apps.folder' and trashed=false"
  );
  const resp = await driveFetch(
    'https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id,name)&spaces=drive'
  );
  const found = await resp.json();

  if (found.files && found.files.length) {
    await DB.setSetting('driveFolderId', found.files[0].id);
    return found.files[0].id;
  }

  const created = await driveFetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: DRIVE_FOLDER, mimeType: 'application/vnd.google-apps.folder' })
  });
  const folder = await created.json();
  await DB.setSetting('driveFolderId', folder.id);
  return folder.id;
}

async function findBackupFile(folderId) {
  const saved = await DB.getSetting('driveFileId', null);
  if (saved) {
    try {
      await driveFetch('https://www.googleapis.com/drive/v3/files/' + saved + '?fields=id');
      return saved;
    } catch (e) {
      // Ficheiro apagado à mão: procura outra vez pelo nome.
    }
  }

  const q = encodeURIComponent(
    "name='" + DRIVE_FILENAME + "' and '" + folderId + "' in parents and trashed=false"
  );
  const resp = await driveFetch(
    'https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id,modifiedTime)'
  );
  const found = await resp.json();
  if (found.files && found.files.length) {
    await DB.setSetting('driveFileId', found.files[0].id);
    return found.files[0].id;
  }
  return null;
}

/* Envia a base de dados inteira. Substitui sempre o mesmo ficheiro —
 * histórico de versões daria uma pasta cheia de lixo ao fim de um ano. */
async function driveBackup() {
  const payload = await DB.exportAll();
  const body = JSON.stringify(payload, null, 2);

  const folderId = await ensureFolder();
  const fileId = await findBackupFile(folderId);

  if (fileId) {
    await driveFetch(
      'https://www.googleapis.com/upload/drive/v3/files/' + fileId + '?uploadType=media',
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: body }
    );
  } else {
    // Criação exige multipart: metadados e conteúdo no mesmo pedido.
    const boundary = 'treino' + Date.now();
    const metadata = { name: DRIVE_FILENAME, parents: [folderId], mimeType: 'application/json' };
    const multipart =
      '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) + '\r\n' +
      '--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' +
      body + '\r\n' +
      '--' + boundary + '--';

    const resp = await driveFetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
        body: multipart
      }
    );
    const created = await resp.json();
    await DB.setSetting('driveFileId', created.id);
  }

  const now = new Date().toISOString();
  await DB.setSetting('lastDriveBackupAt', now);
  await DB.setSetting('lastBackupAt', now);
  return now;
}

/* Traz o ficheiro do Drive e funde com o que está no telemóvel.
 * Funde, não substitui: nada do que está cá é apagado. */
async function driveRestore() {
  const folderId = await ensureFolder();
  const fileId = await findBackupFile(folderId);
  if (!fileId) throw new Error('Não há cópia no Drive.');

  const resp = await driveFetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media');
  const payload = await resp.json();

  if (payload.app && payload.app !== 'treino') {
    throw new Error('O ficheiro no Drive é de outra app.');
  }
  return DB.importAll(payload);
}

/* Data da última cópia que está mesmo no Drive, não a que julgamos ter feito. */
async function driveFileInfo() {
  const folderId = await ensureFolder();
  const fileId = await findBackupFile(folderId);
  if (!fileId) return null;
  const resp = await driveFetch(
    'https://www.googleapis.com/drive/v3/files/' + fileId + '?fields=id,name,modifiedTime,size'
  );
  return resp.json();
}

const Drive = {
  configured: driveConfigured,
  connect: () => getAccessToken(true),
  backup: driveBackup,
  restore: driveRestore,
  info: driveFileInfo
};
