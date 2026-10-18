// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { storeGeneralUpload, UploadStorageUnavailableError } from './uploadStorage.js';

const endpointMocks = vi.hoisted(() => ({
  insert: vi.fn(async () => ({ id: 'synthetic-upload' })),
  createClient: vi.fn(),
}));
vi.mock('../db.js', () => ({
  getOne: vi.fn(), insert: endpointMocks.insert, update: vi.fn(),
  publishRealtimeEvent: vi.fn(async () => {}),
}));
vi.mock('../_lib/auth.js', () => ({ applyAuthCors: vi.fn() }));
vi.mock('multer', () => {
  const multer = () => ({ single: () => (_req, _res, next) => next() });
  multer.memoryStorage = () => ({});
  return { default: multer };
});
vi.mock('@replit/object-storage', () => ({
  Client: vi.fn(function () { return endpointMocks.createClient(); }),
}));
import uploadHandler from '../upload.js';

const body = Buffer.from('isolated synthetic upload');
const filename = 'upload_1_synthetic.png';
const privateError = new Error('SYNTHETIC_PRIVATE_PROVIDER_DETAIL');
const failures = [
  ['missing configuration', undefined, async () => { throw privateError; }],
  ['blank configuration', '  ', async () => { throw privateError; }],
  ['initialization failure', 'synthetic', async () => { throw privateError; }],
  ['null client', 'synthetic', async () => null],
  ['invalid client', 'synthetic', async () => ({})],
  ['write rejection', 'synthetic', async () => ({ uploadFromStream: async () => { throw privateError; } })],
  ['negative write result', 'synthetic', async () => ({ uploadFromStream: async () => ({ ok: false }) })],
];
const profiles = [
  ['production', { NODE_ENV: 'production' }],
  ['strict development', { NODE_ENV: 'development', STARTUP_MODE: 'code-only' }],
  ['deployment marker', { NODE_ENV: 'development', REPLIT_DEPLOYMENT: 'true' }],
  ['numeric deployment marker', { NODE_ENV: 'test', REPLIT_DEPLOYMENT: '1' }],
  ['unknown deployment marker', { NODE_ENV: 'development', REPLIT_DEPLOYMENT: 'unexpected' }],
  ['unowned test markers', { NODE_ENV: 'test', STOCK_AUDIT_ISOLATED: '1' }],
  ['unmarked environment', {}],
  ['unknown strict mode', { NODE_ENV: 'development', STARTUP_MODE: 'unexpected' }],
];
function disk() { return { mkdirSync: vi.fn(), writeFileSync: vi.fn() }; }
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('general upload storage boundary', () => {
  for (const [profile, env] of profiles) {
    for (const [failure, bucket, clientFactory] of failures) {
      it(`${profile}: ${failure} fails closed without any filesystem write`, async () => {
        const filesystem = disk();
        const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const error = await storeGeneralUpload(body, filename, 'image/png', {
          env: { ...env, ALLOW_LOCAL_UPLOADS: 'true', DEFAULT_OBJECT_STORAGE_BUCKET_ID: bucket },
          clientFactory, filesystem,
        }).catch(e => e);
        expect(error).toBeInstanceOf(UploadStorageUnavailableError);
        expect(error.code).toBe('UPLOAD_STORAGE_UNAVAILABLE');
        expect(error.message).not.toContain(privateError.message);
        expect(filesystem.mkdirSync).not.toHaveBeenCalled();
        expect(filesystem.writeFileSync).not.toHaveBeenCalled();
        expect(log).not.toHaveBeenCalled();
      });
    }
  }
  it('does not allow implicit development fallback', async () => {
    const filesystem = disk();
    await expect(storeGeneralUpload(body, filename, 'image/png', {
      env: { NODE_ENV: 'development' }, filesystem,
    })).rejects.toBeInstanceOf(UploadStorageUnavailableError);
    expect(filesystem.mkdirSync).not.toHaveBeenCalled();
    expect(filesystem.writeFileSync).not.toHaveBeenCalled();
  });
  for (const [failure, bucket, clientFactory] of failures) {
    it(`explicit development opt-in permits mock-local fallback: ${failure}`, async () => {
      const filesystem = disk();
      const result = await storeGeneralUpload(body, filename, 'image/png', {
        env: { NODE_ENV: 'development', ALLOW_LOCAL_UPLOADS: 'true', DEFAULT_OBJECT_STORAGE_BUCKET_ID: bucket },
        clientFactory, filesystem,
      });
      expect(result).toBe(`/uploads/${filename}`);
      expect(filesystem.mkdirSync).toHaveBeenCalledOnce();
      expect(filesystem.writeFileSync).toHaveBeenCalledOnce();
      expect(filesystem.writeFileSync.mock.calls[0][1]).toBe(body);
    });
  }
  it('rechecks mode before any local write after cloud failure', async () => {
    const filesystem = disk();
    const env = { NODE_ENV: 'development', ALLOW_LOCAL_UPLOADS: 'true', DEFAULT_OBJECT_STORAGE_BUCKET_ID: 'synthetic' };
    await expect(storeGeneralUpload(body, filename, 'image/png', {
      env, filesystem, clientFactory: async () => {
        env.NODE_ENV = 'production';
        throw privateError;
      },
    })).rejects.toBeInstanceOf(UploadStorageUnavailableError);
    expect(filesystem.mkdirSync).not.toHaveBeenCalled();
    expect(filesystem.writeFileSync).not.toHaveBeenCalled();
  });
  it('sanitizes explicitly opted-in local write failures', async () => {
    const filesystem = disk();
    filesystem.mkdirSync.mockImplementation(() => { throw privateError; });
    await expect(storeGeneralUpload(body, filename, 'image/png', {
      env: { NODE_ENV: 'development', ALLOW_LOCAL_UPLOADS: 'true' }, filesystem,
    })).rejects.toMatchObject({ code: 'UPLOAD_STORAGE_UNAVAILABLE' });
    expect(filesystem.writeFileSync).not.toHaveBeenCalled();
  });
  for (const [profile, env] of profiles) {
    it(`${profile}: successful cloud upload returns the existing App Storage route`, async () => {
      const filesystem = disk();
      const uploadFromStream = vi.fn(async (_object, stream) => {
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        expect(Buffer.concat(chunks)).toEqual(body);
      });
      const clientFactory = vi.fn(async () => ({ uploadFromStream }));
      const result = await storeGeneralUpload(body, filename, 'image/png', {
        env: { ...env, DEFAULT_OBJECT_STORAGE_BUCKET_ID: 'synthetic' }, filesystem, clientFactory,
      });
      expect(result).toBe(`/api/obj/public/uploads/${filename}`);
      expect(clientFactory).toHaveBeenCalledWith('synthetic');
      expect(uploadFromStream.mock.calls[0][2]).toEqual({ contentType: 'image/png' });
      expect(filesystem.mkdirSync).not.toHaveBeenCalled();
      expect(filesystem.writeFileSync).not.toHaveBeenCalled();
    });
  }
  it.each(['../synthetic.png', '..', 'x\\synthetic.png'])('rejects unsafe filename %s before provider or disk access', async value => {
    const filesystem = disk(), clientFactory = vi.fn();
    await expect(storeGeneralUpload(body, value, 'image/png', { env: {}, filesystem, clientFactory }))
      .rejects.toBeInstanceOf(UploadStorageUnavailableError);
    expect(clientFactory).not.toHaveBeenCalled();
    expect(filesystem.mkdirSync).not.toHaveBeenCalled();
    expect(filesystem.writeFileSync).not.toHaveBeenCalled();
  });
});

describe('upload HTTP handler storage boundary with isolated synthetic mocks', () => {
  function response() {
    return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  }
  function request() {
    return {
      method: 'POST', body: { type: 'generic' },
      file: { buffer: body, originalname: 'synthetic.png', mimetype: 'image/png', size: body.length },
    };
  }
  for (const failure of ['missing configuration', 'initialization failure', 'write failure']) {
    it(`returns safe HTTP 503 and no metadata/disk writes on ${failure}`, async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('DEFAULT_OBJECT_STORAGE_BUCKET_ID', failure === 'missing configuration' ? '' : 'synthetic');
      vi.stubEnv('ALLOW_LOCAL_UPLOADS', 'true');
      endpointMocks.createClient.mockImplementation(() => {
        if (failure === 'initialization failure') throw privateError;
        return { uploadFromStream: async () => { throw privateError; } };
      });
      const mkdir = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
      const write = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = response();
      await uploadHandler(request(), res);
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json.mock.calls[0][0]).toMatchObject({ success: false, code: 'UPLOAD_STORAGE_UNAVAILABLE' });
      expect(JSON.stringify(res.json.mock.calls)).not.toContain(privateError.message);
      expect(endpointMocks.insert).not.toHaveBeenCalled();
      expect(mkdir).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    });
  }
  it('persists only the App Storage route after a successful mocked provider write', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEFAULT_OBJECT_STORAGE_BUCKET_ID', 'synthetic');
    endpointMocks.createClient.mockReturnValue({ uploadFromStream: vi.fn(async () => {}) });
    const write = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    const mkdir = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    const res = response();
    await uploadHandler(request(), res);
    expect(res.json.mock.calls[0][0].success).toBe(true);
    expect(res.json.mock.calls[0][0].file.url).toMatch(/^\/api\/obj\/public\/uploads\/upload_/);
    expect(endpointMocks.insert).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
    expect(mkdir).not.toHaveBeenCalled();
  });
});
