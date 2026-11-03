import { Buffer } from 'node:buffer';
import process from 'node:process';

const DEFAULT_WORKSPACE = 'marcs-workspace-csjba';
const DEFAULT_WORKFLOW_ID = 'ai-oral-health-assessment-vai-oral-health-assessment-1-yolo26s-t1-logic';
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;

export class RoboflowWorkflowError extends Error {
  constructor(message, { status = 503, code = 'ROBOFLOW_WORKFLOW_ERROR', cause } = {}) {
    super(message, { cause });
    this.name = 'RoboflowWorkflowError';
    this.status = status;
    this.code = code;
  }
}

function getWorkflowOutputEntry(payload) {
  let entries = Array.isArray(payload) ? payload : null;
  if (!entries && payload && typeof payload === 'object') {
    if (Array.isArray(payload.results)) entries = payload.results;
    else if (Array.isArray(payload.outputs) && payload.outputs.length === 1) entries = payload.outputs;
  }
  if (!entries) entries = [payload];
  if (entries.length !== 1 || !entries[0] || typeof entries[0] !== 'object') {
    throw new RoboflowWorkflowError('Roboflow returned an unexpected result for one image. Check the workflow response.', {
      status: 502,
      code: 'ROBOFLOW_INVALID_RESPONSE',
    });
  }
  return entries[0];
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get('retry-after'));
  return Number.isFinite(retryAfter) && retryAfter > 0
    ? Math.min(retryAfter * 1000, 5000)
    : 350 * (2 ** attempt);
}

function canRetryStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function errorForStatus(status) {
  if (status === 401 || status === 403) {
    return new RoboflowWorkflowError('Roboflow rejected the API key or access to this workflow.', { status, code: 'ROBOFLOW_AUTH_FAILED' });
  }
  if (status === 404) {
    return new RoboflowWorkflowError('The Roboflow workflow could not be found. Check its workspace and workflow ID.', { status, code: 'ROBOFLOW_WORKFLOW_NOT_FOUND' });
  }
  if (status === 413) {
    return new RoboflowWorkflowError('Roboflow rejected the image because it is too large.', { status, code: 'ROBOFLOW_IMAGE_TOO_LARGE' });
  }
  if (status === 429) {
    return new RoboflowWorkflowError('Roboflow is rate-limiting requests. Wait a moment and try again.', { status, code: 'ROBOFLOW_RATE_LIMITED' });
  }
  if (status >= 500) {
    return new RoboflowWorkflowError('Roboflow is temporarily unavailable. Please try again shortly.', { status, code: 'ROBOFLOW_UNAVAILABLE' });
  }
  return new RoboflowWorkflowError(`Roboflow rejected the workflow request (HTTP ${status}). Check the workflow input and parameters.`, {
    status: status >= 400 ? status : 502,
    code: 'ROBOFLOW_REQUEST_REJECTED',
  });
}

export async function runOralHealthWorkflow(image, options = {}) {
  const apiKey = String(options.apiKey ?? process.env.ROBOFLOW_API_KEY ?? '').trim();
  const workspace = String(options.workspace ?? process.env.ROBOFLOW_WORKSPACE_SLUG ?? DEFAULT_WORKSPACE).trim();
  const workflowId = String(options.workflowId ?? process.env.ROBOFLOW_WORKFLOW_ID ?? DEFAULT_WORKFLOW_ID).trim();
  const fetchImpl = options.fetchImpl ?? fetch;
  if (!apiKey) {
    throw new RoboflowWorkflowError('AI analysis is not configured yet. Add a Roboflow API key to the project .env file, then restart the server.', {
      status: 503,
      code: 'ROBOFLOW_NOT_CONFIGURED',
    });
  }
  if (!workspace || !workflowId || !Buffer.isBuffer(image?.buffer) || image.buffer.length === 0) {
    throw new RoboflowWorkflowError('The Roboflow workflow request is missing its workspace, workflow ID, or image.', {
      status: 400,
      code: 'ROBOFLOW_INVALID_REQUEST',
    });
  }

  const endpoint = options.endpoint || `https://serverless.roboflow.com/${encodeURIComponent(workspace)}/workflows/${encodeURIComponent(workflowId)}`;
  const body = JSON.stringify({
    inputs: {
      image: { type: 'base64', value: image.buffer.toString('base64') },
    },
  });

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (cause) {
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise(resolve => setTimeout(resolve, 350 * (2 ** attempt)));
        continue;
      }
      throw new RoboflowWorkflowError('Could not reach Roboflow after three attempts. Check the server connection and try again.', {
        status: 503,
        code: 'ROBOFLOW_NETWORK_ERROR',
        cause,
      });
    }

    if (!response.ok) {
      if (canRetryStatus(response.status) && attempt < MAX_ATTEMPTS - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelay(response, attempt)));
        continue;
      }
      throw errorForStatus(response.status);
    }

    let payload;
    try {
      payload = await response.json();
    } catch (cause) {
      throw new RoboflowWorkflowError('Roboflow returned a response that was not valid JSON.', {
        status: 502,
        code: 'ROBOFLOW_INVALID_JSON',
        cause,
      });
    }
    const outputEntry = getWorkflowOutputEntry(payload);
    if (!Object.keys(outputEntry).length) {
      throw new RoboflowWorkflowError('Roboflow returned no named workflow outputs for this image.', {
        status: 502,
        code: 'ROBOFLOW_EMPTY_OUTPUT',
      });
    }
    return { outputEntry, outputNames: Object.keys(outputEntry) };
  }

  throw new RoboflowWorkflowError('Roboflow inference could not be completed. Please try again.', { status: 503 });
}

function readConfidence(record) {
  const value = Number(record.confidence ?? record.score ?? record.probability);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value > 1 ? value / 100 : value));
}

export function collectWorkflowDetections(value, { maxDetections = 100 } = {}) {
  const detections = [];
  const seen = new Set();
  const visited = new WeakSet();
  const stack = [{ value, depth: 0 }];
  while (stack.length && detections.length < maxDetections) {
    const current = stack.pop();
    const item = current.value;
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (item.length <= 64_000 && (trimmed.startsWith('{') || trimmed.startsWith('['))) {
        try { stack.push({ value: JSON.parse(item), depth: current.depth + 1 }); } catch { /* Plain strings are not detection records. */ }
      }
      continue;
    }
    if (!item || typeof item !== 'object' || current.depth > 12 || visited.has(item)) continue;
    visited.add(item);
    if (!Array.isArray(item)) {
      const label = [item.class, item.class_name, item.label, item.finding, item.name]
        .find(candidate => typeof candidate === 'string' && candidate.trim());
      const confidence = readConfidence(item);
      if (label && confidence !== null) {
        const normalizedLabel = label.trim().slice(0, 100);
        const coordinates = ['x', 'y', 'width', 'height'].map(key => Number(item[key]));
        const box = coordinates.every(Number.isFinite)
          ? { x: coordinates[0], y: coordinates[1], width: coordinates[2], height: coordinates[3] }
          : null;
        const signature = `${normalizedLabel}|${confidence}|${box ? coordinates.join(',') : ''}`;
        if (!seen.has(signature)) {
          seen.add(signature);
          detections.push({ label: normalizedLabel, confidence, box });
        }
      }
    }
    for (const child of Object.values(item)) stack.push({ value: child, depth: current.depth + 1 });
  }
  return detections;
}
