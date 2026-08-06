import { AuthPrincipal } from '@justtellme/auth-token';
import { describe, expect, it, vi } from 'vitest';

import { GET, POST } from './{conversation_id}.ts';

const userUuid = '00000000-0000-4000-8000-000000000001';
const identityToken = AuthPrincipal.consumerToken(userUuid);

function response() {
  return {
    locals: {
      getForwardHeaders: async () => ({ 'x-auth-token': identityToken }),
    },
    json: vi.fn(),
    status: vi.fn().mockReturnThis(),
  };
}

describe('public agent conversation proxy', () => {
  it('loads only the caller-owned conversation and strips internal metadata', async () => {
    const upstreamGet = vi.fn().mockResolvedValue({
      data: {
        conversation_id: 'ai_example',
        owners: [`user:${userUuid}`],
        turns: [{ turn_id: 'ait_example', metadata: { model: 'internal-model' } }],
      },
    });
    const req = {
      params: { conversation_id: 'ai_example' },
      app: { locals: { datasources: { agentInternal: { GET: upstreamGet } } } },
    };
    const res = response();

    await GET(req as never, res as never);

    expect(upstreamGet).toHaveBeenCalledWith('/conversations/{conversation_id}', {
      params: {
        path: { conversation_id: 'ai_example' },
        query: { owners: [`user:${userUuid}`], metadata: false },
      },
    });
    expect(res.json).toHaveBeenCalledWith({
      conversation_id: 'ai_example',
      turns: [{ turn_id: 'ait_example', metadata: undefined }],
    });
  });

  it('sets ownership and forwards identity when creating a conversation', async () => {
    const upstreamPost = vi.fn().mockResolvedValue({
      data: { conversation_id: 'ai_example', status: 'running' },
      response: new Response('{}', { status: 200 }),
    });
    const req = {
      params: { conversation_id: 'ai_example' },
      body: {
        client: { name: 'example-web', version: '1.0.0' },
        type: 'example-assistant',
        response: 'complete',
      },
      app: { locals: { datasources: { agentInternal: { POST: upstreamPost } } } },
    };
    const res = response();

    await POST(req as never, res as never);

    expect(upstreamPost).toHaveBeenCalledWith('/conversations/{conversation_id}', {
      parseAs: 'json',
      params: { path: { conversation_id: 'ai_example' } },
      body: expect.objectContaining({
        type: 'example-assistant',
        owners: [`user:${userUuid}`],
        identity_token: identityToken,
      }),
    });
  });
});
