import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUOTA_PUBLIC_MESSAGE,
  FAILURE_PUBLIC_MESSAGE,
  classifyUpstreamFailure,
} from './generation_errors.ts';

test('quota responses get a distinct Bulgarian message and keep the metric for logs', () => {
  const body = {
    error: {
      code: 429,
      status: 'RESOURCE_EXHAUSTED',
      message:
        "Quota exceeded for quota metric 'GenerateContentRequestsPerDayPerProjectPerModel' and limit 'GenerateContentRequestsPerDayPerProjectPerModel free tier'.",
    },
  };
  const classified = classifyUpstreamFailure(429, body);
  assert.equal(classified.kind, 'quota');
  assert.equal(classified.publicMessage, QUOTA_PUBLIC_MESSAGE);
  assert.match(classified.publicMessage, /пробата не е отнета/);
  assert.equal(classified.quotaMetric, 'GenerateContentRequestsPerDayPerProjectPerModel');
  assert.equal(classified.httpStatus, 429);
  assert.doesNotMatch(classified.publicMessage, /GenerateContent/);
});

test('plain upstream failures stay distinct from quota errors', () => {
  const classified = classifyUpstreamFailure(500, { message: { en: 'internal explosion' } });
  assert.equal(classified.kind, 'other');
  assert.equal(classified.publicMessage, FAILURE_PUBLIC_MESSAGE);
  assert.equal(classified.quotaMetric, null);
  assert.match(classified.summary, /internal explosion/);
});

test('Gemini-style billing text without HTTP 429 is still a quota error', () => {
  const classified = classifyUpstreamFailure(403, {
    error: { status: 'RESOURCE_EXHAUSTED', message: 'Please check your plan and billing details.' },
  });
  assert.equal(classified.kind, 'quota');
});
