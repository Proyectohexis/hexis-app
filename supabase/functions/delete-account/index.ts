import { createClient } from 'npm:@supabase/supabase-js@2.106.2';

const DELETE_CONFIRMATION = 'ELIMINAR HEXIS';
const MAX_REQUEST_BYTES = 4096;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function jwtSubject(authorization: string) {
  try {
    const token = authorization.slice('Bearer '.length);
    const payloadSegment = token.split('.')[1];
    if (!payloadSegment) return '';
    const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded));
    return typeof payload?.sub === 'string' && UUID_PATTERN.test(payload.sub) ? payload.sub : '';
  } catch {
    return '';
  }
}

async function readLimitedJsonBody(request: Request): Promise<{
  payload?: Record<string, unknown>;
  error?: 'invalid_request' | 'request_too_large';
}> {
  const declaredLength = request.headers.get('Content-Length');
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isFinite(parsedLength) || parsedLength < 0) return { error: 'invalid_request' };
    if (parsedLength > MAX_REQUEST_BYTES) return { error: 'request_too_large' };
  }

  const reader = request.body?.getReader();
  if (!reader) return { error: 'invalid_request' };

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_REQUEST_BYTES) {
      await reader.cancel();
      return { error: 'request_too_large' };
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: 'invalid_request' };
    }
    return { payload: parsed as Record<string, unknown> };
  } catch {
    return { error: 'invalid_request' };
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse(405, { code: 'method_not_allowed' });
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) {
    return jsonResponse(415, { code: 'unsupported_media_type' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const publishableKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return jsonResponse(503, { code: 'server_not_configured' });
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse(401, { code: 'authentication_required' });
  }
  const parsedBody = await readLimitedJsonBody(request);
  if (parsedBody.error === 'request_too_large') {
    return jsonResponse(413, { code: parsedBody.error });
  }
  if (parsedBody.error || !parsedBody.payload) {
    return jsonResponse(400, { code: 'invalid_request' });
  }
  const payload = parsedBody.payload;

  const password = typeof payload.password === 'string' ? payload.password : '';
  const confirmation = typeof payload.confirmation === 'string' ? payload.confirmation : '';
  const operationId = typeof payload.operationId === 'string' ? payload.operationId : '';
  if (
    !password
    || password.length > 128
    || confirmation !== DELETE_CONFIRMATION
    || !UUID_PATTERN.test(operationId)
  ) {
    return jsonResponse(422, { code: 'invalid_confirmation' });
  }

  const tokenUserId = jwtSubject(authorization);
  if (!tokenUserId) {
    return jsonResponse(401, { code: 'authentication_required' });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const receiptArguments = {
    p_user_id: tokenUserId,
    p_operation_id: operationId,
  };
  const { data: existingReceipt, error: receiptLookupError } = await adminClient.rpc(
    'get_account_deletion_receipt',
    receiptArguments,
  );
  if (receiptLookupError) {
    return jsonResponse(500, { code: 'receipt_lookup_failed' });
  }
  if (existingReceipt === 'completed') {
    return jsonResponse(200, { deleted: true, operationId, reconciled: true });
  }
  if (existingReceipt === 'pending') {
    const { data: pendingUser, error: pendingUserError } =
      await adminClient.auth.admin.getUserById(tokenUserId);
    const userIsMissing = !pendingUser?.user && (
      pendingUserError?.status === 404
      || pendingUserError?.code === 'user_not_found'
    );
    if (userIsMissing) {
      const { error: completionError } = await adminClient.rpc(
        'complete_account_deletion_receipt',
        receiptArguments,
      );
      if (completionError) return jsonResponse(500, { code: 'receipt_completion_failed' });
      return jsonResponse(200, { deleted: true, operationId, reconciled: true });
    }
    if (pendingUserError || !pendingUser?.user) {
      return jsonResponse(500, { code: 'receipt_reconciliation_failed' });
    }
  }

  const callerClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  const caller = callerData.user;
  if (callerError || !caller?.id || !caller.email || caller.id !== tokenUserId) {
    return jsonResponse(401, { code: 'authentication_required' });
  }

  // Reauthentication happens only inside the trusted function. The password
  // is never stored, logged, echoed or sent through a database RPC.
  const reauthenticationClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: reauthenticationData, error: reauthenticationError } =
    await reauthenticationClient.auth.signInWithPassword({
      email: caller.email,
      password,
    });
  if (
    reauthenticationError
    || !reauthenticationData.user
    || reauthenticationData.user.id !== caller.id
  ) {
    return jsonResponse(403, { code: 'reauthentication_failed' });
  }

  const { error: receiptStartError } = await adminClient.rpc(
    'begin_account_deletion_receipt',
    receiptArguments,
  );
  if (receiptStartError) {
    return jsonResponse(500, { code: 'receipt_start_failed' });
  }

  const { error: deletionError } = await adminClient.auth.admin.deleteUser(caller.id, false);
  if (deletionError) {
    await adminClient.rpc('clear_pending_account_deletion_receipt', receiptArguments);
    return jsonResponse(500, { code: 'deletion_failed' });
  }

  const { error: receiptCompletionError } = await adminClient.rpc(
    'complete_account_deletion_receipt',
    receiptArguments,
  );
  if (receiptCompletionError) {
    return jsonResponse(500, { code: 'receipt_completion_failed' });
  }

  return jsonResponse(200, {
    deleted: true,
    operationId,
    reconciled: false,
  });
});
