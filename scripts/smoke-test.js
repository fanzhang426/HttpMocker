import http from 'node:http';

const ui = 'http://127.0.0.1:8898';
const targetPort = 19191;
let captureId;
const captureIds = [];
let ruleId;
const ruleIds = [];
const remoteRuleIds = [];
let originalSettings = {};
const runId = Date.now();

const server = http.createServer((req, res) => {
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    const payload = { source: 'real', url: req.url, requestBody: body, requestHeaders: req.headers };
    if (req.url.startsWith('/api/remote-query')) {
      payload.data = {
        reward_list: [
          { name: 'old-zero' },
          { name: 'keep-one' }
        ]
      };
    }
    res.end(JSON.stringify(payload));
  });
});

await listen(server, targetPort);

try {
  const settingsResult = await json(`${ui}/api/settings`);
  originalSettings = settingsResult.settings || {};
  await json(`${ui}/api/settings`, {
    method: 'PATCH',
    body: {
      captureFilter: '',
      captureMergeEnabled: true,
      captureTreeViewEnabled: false
    }
  });
  const smokeTabId = `smoke-tab-${runId}`;
  const captureTabs = Array.isArray(originalSettings.captureTabs) ? originalSettings.captureTabs : [];
  await json(`${ui}/api/settings`, {
    method: 'PATCH',
    body: {
      captureTabs: [
        ...captureTabs.filter((tab) => tab?.filter !== '127.0.0.1'),
        {
          id: smokeTabId,
          name: '127.0.0.1',
          filter: '127.0.0.1',
          displayFilter: '',
          projectPath: ''
        }
      ],
      activeCaptureTabId: smokeTabId,
      domainProjectsInitialized: true
    }
  });

  const unopenedHostUrl = `http://localhost:${targetPort}/api/unopened-host?run=${runId}`;
  const openedHostUrl = `http://127.0.0.1:${targetPort}/api/opened-host?run=${runId}`;
  const unopenedHost = await requestThroughProxy(unopenedHostUrl);
  const openedHost = await requestThroughProxy(openedHostUrl);
  if (!unopenedHost.body.includes('/api/unopened-host') || !openedHost.body.includes('/api/opened-host')) {
    throw new Error('Domain-gated passthrough requests did not reach upstream.');
  }
  const domainGatedCaptures = await json(`${ui}/api/captures`);
  const unopenedCapture = domainGatedCaptures.captures.find((item) => item.url === unopenedHostUrl);
  const openedCapture = domainGatedCaptures.captures.find((item) => item.url === openedHostUrl);
  if (unopenedCapture) {
    throw new Error(`Unopened host should passthrough without being recorded: ${JSON.stringify(unopenedCapture)}`);
  }
  if (!openedCapture || openedCapture.summaryOnly) {
    throw new Error(`Opened host should be captured with content: ${JSON.stringify(openedCapture)}`);
  }
  captureIds.push(openedCapture.id);

  await requestThroughProxy(`http://127.0.0.1:${targetPort}/api/smoke?page=1`);

  const captures = await json(`${ui}/api/captures`);
  const capture = captures.captures.find((item) => item.url === `http://127.0.0.1:${targetPort}/api/smoke?page=1`);
  if (!capture) {
    throw new Error('Proxy did not record the smoke-test request.');
  }
  captureId = capture.id;
  captureIds.push(capture.id);

  const historyUrl = `http://127.0.0.1:${targetPort}/api/history?run=${runId}`;
  await requestThroughProxy(historyUrl);
  await wait(20);
  await requestThroughProxy(historyUrl);
  const historyCaptures = await json(`${ui}/api/captures`);
  const historyCapture = historyCaptures.captures.find((item) => item.url === historyUrl);
  if (!historyCapture) {
    throw new Error('History capture was not recorded.');
  }
  if (!Array.isArray(historyCapture.history) || historyCapture.history.length !== 1) {
    throw new Error(`Expected grouped capture history, got ${JSON.stringify(historyCapture.history)}`);
  }
  if (historyCapture.history[0].id === historyCapture.id) {
    throw new Error('Grouped capture history should not include the latest capture id.');
  }
  captureIds.push(historyCapture.id, historyCapture.history[0].id);

  const postUrl = `http://127.0.0.1:${targetPort}/api/post-dedupe?run=${runId}`;
  await requestThroughProxy(postUrl, {
    method: 'POST',
    body: JSON.stringify({ body: 'alpha' })
  });
  await requestThroughProxy(postUrl, {
    method: 'POST',
    body: JSON.stringify({ body: 'beta' })
  });
  await requestThroughProxy(postUrl, {
    method: 'POST',
    body: JSON.stringify({ body: 'alpha' })
  });

  const postCaptures = await json(`${ui}/api/captures`);
  const matchingPostCaptures = postCaptures.captures.filter((item) => item.path === '/api/post-dedupe' && String(item.query || '').includes(`run=${runId}`));
  captureIds.push(...matchingPostCaptures.map((item) => item.id));
  if (matchingPostCaptures.length !== 1 || matchingPostCaptures[0].history?.length !== 2) {
    throw new Error(`Expected POST captures to merge by body by default: ${JSON.stringify(matchingPostCaptures)}`);
  }

  const postMergeKey = matchingPostCaptures[0].mergeKey;
  await json(`${ui}/api/settings`, {
    method: 'PATCH',
    body: { captureMergeEnabled: false }
  });
  const unmergedPostCaptures = await json(`${ui}/api/captures`);
  const unmergedPostItems = unmergedPostCaptures.captures.filter((item) => item.path === '/api/post-dedupe' && String(item.query || '').includes(`run=${runId}`));
  if (unmergedPostItems.length !== 3 || unmergedPostItems.some((item) => item.history?.length)) {
    throw new Error(`Expected global merge switch off to show every POST capture separately: ${JSON.stringify(unmergedPostItems)}`);
  }
  await json(`${ui}/api/settings`, {
    method: 'PATCH',
    body: { captureMergeEnabled: true }
  });

  await json(`${ui}/api/settings`, {
    method: 'PATCH',
    body: {
      captureMergeRules: {
        [postMergeKey]: { body: true, bodyTemplate: JSON.stringify({ body: 'alpha' }) }
      }
    }
  });
  const bodyTemplateCaptures = await json(`${ui}/api/captures`);
  const bodyTemplatePostCaptures = bodyTemplateCaptures.captures.filter((item) => item.path === '/api/post-dedupe' && String(item.query || '').includes(`run=${runId}`));
  if (bodyTemplatePostCaptures.length !== 2) {
    throw new Error(`Expected POST captures to keep only template-matching bodies when body merge is customized: ${JSON.stringify(bodyTemplatePostCaptures)}`);
  }
  const alphaBodyGroup = bodyTemplatePostCaptures.find((item) => item.history?.length);
  const betaBodyGroup = bodyTemplatePostCaptures.find((item) => !item.history?.length);
  if (!alphaBodyGroup || alphaBodyGroup.history.length !== 1 || !betaBodyGroup) {
    throw new Error(`Expected template-matching body variants to group, and non-matching same body variants to keep their own group: ${JSON.stringify(bodyTemplatePostCaptures)}`);
  }
  const postCaptureDetails = await Promise.all(
    bodyTemplatePostCaptures.map((item) => json(`${ui}/api/captures/${item.id}`))
  );
  const requestBodies = postCaptureDetails
    .map((item) => JSON.parse(item.requestBody?.body || '{}').body)
    .sort();
  if (requestBodies.join('\n') !== 'alpha\nbeta') {
    throw new Error(`Unexpected request body previews: ${requestBodies.join(' | ')}`);
  }
  const alphaDetailForLegacyMerge = postCaptureDetails.find((item) => JSON.parse(item.requestBody?.body || '{}').body === 'alpha');
  const betaDetailForLegacyMerge = postCaptureDetails.find((item) => JSON.parse(item.requestBody?.body || '{}').body === 'beta');
  await json(`${ui}/api/settings`, {
    method: 'PATCH',
    body: {
      captureMergeRules: {
        [postMergeKey]: { body: true }
      }
    }
  });
  const bodyVariantCaptures = await json(`${ui}/api/captures`);
  const bodyVariantPostCaptures = bodyVariantCaptures.captures.filter((item) => item.path === '/api/post-dedupe' && String(item.query || '').includes(`run=${runId}`));
  const alphaBodyVariantGroup = bodyVariantPostCaptures.find((item) => item.id === alphaDetailForLegacyMerge.id || item.history?.some((history) => history.id === alphaDetailForLegacyMerge.id));
  const betaBodyVariantGroup = bodyVariantPostCaptures.find((item) => item.id === betaDetailForLegacyMerge.id || item.history?.some((history) => history.id === betaDetailForLegacyMerge.id));
  const alphaDetailForMerge = await json(`${ui}/api/captures/${alphaBodyVariantGroup.id}`);
  const betaDetailForMerge = await json(`${ui}/api/captures/${betaBodyVariantGroup.id}`);
  const alphaVariantKey = alphaDetailForMerge.mergeOptions?.variantKey;
  if (!alphaVariantKey) {
    throw new Error(`Expected alpha body merge variant key: ${JSON.stringify(alphaDetailForMerge.mergeOptions)}`);
  }
  await json(`${ui}/api/settings`, {
    method: 'PATCH',
    body: {
      captureMergeRules: {
        [postMergeKey]: {
          body: true,
          variants: {
            [alphaVariantKey]: {
              bodyTemplate: JSON.stringify({ body: 'alpha', edited: true }),
              requestContentType: alphaDetailForMerge.requestContentType || 'application/json'
            }
          }
        }
      },
      validateCaptureMergeRules: true,
      captureMergeValidation: {
        mergeKey: postMergeKey,
        variantKey: alphaVariantKey
      }
    }
  });
  const editedAlphaBodyDetail = await json(`${ui}/api/captures/${alphaDetailForMerge.id}`);
  const betaBodyAfterAlphaEdit = await json(`${ui}/api/captures/${betaDetailForMerge.id}`);
  if (editedAlphaBodyDetail.mergeOptions?.bodyTemplate !== JSON.stringify({ body: 'alpha', edited: true })) {
    throw new Error(`Edited body merge template did not persist for selected variant: ${JSON.stringify(editedAlphaBodyDetail.mergeOptions)}`);
  }
  if (!jsonTextEqual(betaBodyAfterAlphaEdit.mergeOptions?.bodyTemplate, betaDetailForMerge.requestBody?.body)) {
    throw new Error(`Body merge template leaked across variants: ${JSON.stringify(betaBodyAfterAlphaEdit.mergeOptions)}`);
  }
  const betaVariantKey = betaDetailForMerge.mergeOptions?.variantKey;
  await json(`${ui}/api/settings`, {
    method: 'PATCH',
    body: {
      captureMergeRules: {
        [postMergeKey]: {
          body: true,
          variants: {
            [alphaVariantKey]: {
              bodyTemplate: JSON.stringify({ body: 'alpha' }),
              requestContentType: alphaDetailForMerge.requestContentType || 'application/json'
            },
            [betaVariantKey]: {
              bodyTemplate: JSON.stringify({ body: 'alpha', extra: 'narrow' }),
              requestContentType: alphaDetailForMerge.requestContentType || 'application/json'
            }
          }
        }
      },
      validateCaptureMergeRules: true,
      captureMergeValidation: {
        mergeKey: postMergeKey,
        variantKey: alphaVariantKey
      }
    }
  });
  const bodyVariantMergeResult = await json(`${ui}/api/captures`);
  const alphaMergedItems = bodyVariantMergeResult.captures.filter((item) => item.path === '/api/post-dedupe' && String(item.query || '').includes(`run=${runId}`));
  const alphaWideGroup = alphaMergedItems.find((item) => item.id === alphaDetailForMerge.id || item.history?.some((history) => history.id === alphaDetailForMerge.id));
  if (!alphaWideGroup) {
    throw new Error(`Wider body merge template should remain visible after merging narrower variant: ${JSON.stringify(alphaMergedItems)}`);
  }
  const bodyVariantSettings = await json(`${ui}/api/settings`);
  const bodyVariantsAfterWideSave = bodyVariantSettings.settings?.captureMergeRules?.[postMergeKey]?.variants || {};
  if (!bodyVariantsAfterWideSave[alphaVariantKey] || !bodyVariantsAfterWideSave[betaVariantKey]) {
    throw new Error(`Wider body merge template should not delete narrower variants: ${JSON.stringify(bodyVariantsAfterWideSave)}`);
  }
  const invalidBodyMerge = await jsonRejects(`${ui}/api/settings`, {
    method: 'PATCH',
    body: {
      captureMergeRules: {
        [postMergeKey]: {
          body: true,
          variants: {
            [alphaVariantKey]: {
              bodyTemplate: JSON.stringify({ body: 'alpha', extra: 'narrow' }),
              requestContentType: alphaDetailForMerge.requestContentType || 'application/json'
            },
            [betaVariantKey]: {
              bodyTemplate: JSON.stringify({ body: 'alpha' }),
              requestContentType: alphaDetailForMerge.requestContentType || 'application/json'
            }
          }
        }
      },
      validateCaptureMergeRules: true,
      captureMergeValidation: {
        mergeKey: postMergeKey,
        variantKey: alphaVariantKey
      }
    }
  });
  if (invalidBodyMerge.statusCode !== 409 || invalidBodyMerge.body?.code !== 'RULE_MATCH_CONFLICT') {
    throw new Error(`Body merge variant covered by another variant should require manual handling: ${JSON.stringify(invalidBodyMerge)}`);
  }
  await json(`${ui}/api/settings`, {
    method: 'PATCH',
    body: { captureMergeRules: {} }
  });

  const queryMergeA = `http://127.0.0.1:${targetPort}/api/query-merge?run=${runId}&page=1`;
  const queryMergeB = `http://127.0.0.1:${targetPort}/api/query-merge?run=${runId}&page=2`;
  await requestThroughProxy(queryMergeA);
  await requestThroughProxy(queryMergeB);
  const queryMergeCaptures = await json(`${ui}/api/captures`);
  const queryMergeItems = queryMergeCaptures.captures.filter((item) => item.path === '/api/query-merge' && String(item.query || '').includes(`run=${runId}`));
  captureIds.push(...queryMergeItems.map((item) => item.id));
  if (queryMergeItems.length !== 1 || queryMergeItems[0].history?.length !== 1) {
    throw new Error(`Expected query variants to merge by default: ${JSON.stringify(queryMergeItems)}`);
  }
  await json(`${ui}/api/settings`, {
    method: 'PATCH',
    body: {
      captureMergeRules: {
        [queryMergeItems[0].mergeKey]: { query: true, queryTemplate: `run=${runId}&page=1` }
      }
    }
  });
  const queryTemplateCaptures = await json(`${ui}/api/captures`);
  const queryTemplateItems = queryTemplateCaptures.captures.filter((item) => item.path === '/api/query-merge' && String(item.query || '').includes(`run=${runId}`));
  if (queryTemplateItems.length !== 2) {
    throw new Error(`Expected query variants to split into template-matching and non-matching groups when query merge is customized: ${JSON.stringify(queryTemplateItems)}`);
  }
  const templateQueryGroup = queryTemplateItems.find((item) => item.query === `run=${runId}&page=1`);
  const otherQueryGroup = queryTemplateItems.find((item) => item.query === `run=${runId}&page=2`);
  if (!templateQueryGroup || !otherQueryGroup) {
    throw new Error(`Expected query template and non-template groups to both remain visible: ${JSON.stringify(queryTemplateItems)}`);
  }
  const templateQueryDetail = await json(`${ui}/api/captures/${templateQueryGroup.id}`);
  const otherQueryDetail = await json(`${ui}/api/captures/${otherQueryGroup.id}`);
  await json(`${ui}/api/settings`, {
    method: 'PATCH',
    body: {
      captureMergeRules: {
        [templateQueryGroup.mergeKey]: { query: true }
      }
    }
  });
  const queryVariantCaptures = await json(`${ui}/api/captures`);
  const queryVariantItems = queryVariantCaptures.captures.filter((item) => item.path === '/api/query-merge' && String(item.query || '').includes(`run=${runId}`));
  const templateQueryVariantGroup = queryVariantItems.find((item) => item.query === `run=${runId}&page=1`);
  const otherQueryVariantGroup = queryVariantItems.find((item) => item.query === `run=${runId}&page=2`);
  const templateQueryVariantDetail = await json(`${ui}/api/captures/${templateQueryVariantGroup.id}`);
  const otherQueryVariantDetail = await json(`${ui}/api/captures/${otherQueryVariantGroup.id}`);
  const queryVariantKey = templateQueryVariantDetail.mergeOptions?.variantKey;
  if (!queryVariantKey) {
    throw new Error(`Expected query merge variant key: ${JSON.stringify(templateQueryVariantDetail.mergeOptions)}`);
  }
  await json(`${ui}/api/settings`, {
    method: 'PATCH',
    body: {
      captureMergeRules: {
        [templateQueryVariantGroup.mergeKey]: {
          query: true,
          variants: {
            [queryVariantKey]: {
              queryTemplate: `run=${runId}&page=1&edited=true`
            }
          }
        }
      },
      validateCaptureMergeRules: true,
      captureMergeValidation: {
        mergeKey: templateQueryVariantGroup.mergeKey,
        variantKey: queryVariantKey
      }
    }
  });
  const editedQueryDetail = await json(`${ui}/api/captures/${templateQueryVariantGroup.id}`);
  const otherQueryAfterEdit = await json(`${ui}/api/captures/${otherQueryVariantDetail.id}`);
  if (editedQueryDetail.mergeOptions?.queryTemplate !== `run=${runId}&page=1&edited=true`) {
    throw new Error(`Edited query merge template did not persist for selected variant: ${JSON.stringify(editedQueryDetail.mergeOptions)}`);
  }
  if (otherQueryAfterEdit.mergeOptions?.queryTemplate !== otherQueryVariantDetail.query) {
    throw new Error(`Query merge template leaked across variants: ${JSON.stringify(otherQueryAfterEdit.mergeOptions)}`);
  }
  const narrowerQueryKey = otherQueryVariantDetail.mergeOptions?.variantKey;
  await json(`${ui}/api/settings`, {
    method: 'PATCH',
    body: {
      captureMergeRules: {
        [templateQueryVariantGroup.mergeKey]: {
          query: true,
          variants: {
            [queryVariantKey]: {
              queryTemplate: `run=${runId}`
            },
            [narrowerQueryKey]: {
              queryTemplate: `run=${runId}&page=2`
            }
          }
        }
      },
      validateCaptureMergeRules: true,
      captureMergeValidation: {
        mergeKey: templateQueryVariantGroup.mergeKey,
        variantKey: queryVariantKey
      }
    }
  });
  const queryVariantMergeResult = await json(`${ui}/api/captures`);
  const mergedQueryItems = queryVariantMergeResult.captures.filter((item) => item.path === '/api/query-merge' && String(item.query || '').includes(`run=${runId}`));
  if (mergedQueryItems.length !== 2) {
    throw new Error(`Wider query merge template should keep narrower variants visible: ${JSON.stringify(mergedQueryItems)}`);
  }
  const wideQueryGroup = mergedQueryItems.find((item) => item.query === `run=${runId}&page=1`);
  const narrowQueryGroup = mergedQueryItems.find((item) => item.query === `run=${runId}&page=2`);
  if (!wideQueryGroup || !narrowQueryGroup) {
    throw new Error(`Expected wider and narrower query groups to both remain visible: ${JSON.stringify(mergedQueryItems)}`);
  }
  const wideQueryPriorityDetail = await json(`${ui}/api/captures/${wideQueryGroup.id}`);
  const narrowQueryPriorityDetail = await json(`${ui}/api/captures/${narrowQueryGroup.id}`);
  if (wideQueryPriorityDetail.mergeOptions?.variantKey !== queryVariantKey) {
    throw new Error(`Wider query group used the wrong variant: ${JSON.stringify(wideQueryPriorityDetail.mergeOptions)}`);
  }
  if (narrowQueryPriorityDetail.mergeOptions?.variantKey !== narrowerQueryKey) {
    throw new Error(`Narrower query group should take priority when both variants match: ${JSON.stringify(narrowQueryPriorityDetail.mergeOptions)}`);
  }
  const queryVariantSettings = await json(`${ui}/api/settings`);
  const queryVariantsAfterWideSave = queryVariantSettings.settings?.captureMergeRules?.[templateQueryVariantGroup.mergeKey]?.variants || {};
  if (!queryVariantsAfterWideSave[queryVariantKey] || !queryVariantsAfterWideSave[narrowerQueryKey]) {
    throw new Error(`Wider query merge template should not delete narrower variants: ${JSON.stringify(queryVariantsAfterWideSave)}`);
  }
  const invalidQueryMerge = await jsonRejects(`${ui}/api/settings`, {
    method: 'PATCH',
    body: {
      captureMergeRules: {
        [templateQueryVariantGroup.mergeKey]: {
          query: true,
          variants: {
            [queryVariantKey]: {
              queryTemplate: `run=${runId}&page=1`
            },
            [narrowerQueryKey]: {
              queryTemplate: `run=${runId}`
            }
          }
        }
      },
      validateCaptureMergeRules: true,
      captureMergeValidation: {
        mergeKey: templateQueryVariantGroup.mergeKey,
        variantKey: queryVariantKey
      }
    }
  });
  if (invalidQueryMerge.statusCode !== 409 || invalidQueryMerge.body?.code !== 'RULE_MATCH_CONFLICT') {
    throw new Error(`Query merge variant covered by another variant should require manual handling: ${JSON.stringify(invalidQueryMerge)}`);
  }
  await json(`${ui}/api/settings`, {
    method: 'PATCH',
    body: { captureTreeViewEnabled: true }
  });
  const treeViewCaptures = await json(`${ui}/api/captures`);
  const treeViewQueryItems = treeViewCaptures.captures.filter((item) => item.path === '/api/query-merge' && String(item.query || '').includes(`run=${runId}`));
  if (treeViewQueryItems.length !== 2 || treeViewQueryItems.some((item) => item.history?.length)) {
    throw new Error(`Expected tree view source data to ignore capture merge grouping: ${JSON.stringify(treeViewQueryItems)}`);
  }
  await json(`${ui}/api/settings`, {
    method: 'PATCH',
    body: { captureTreeViewEnabled: false }
  });
  await json(`${ui}/api/settings`, {
    method: 'PATCH',
    body: { captureMergeRules: {} }
  });

  const repeatUrl = `http://127.0.0.1:${targetPort}/api/repeat-source?run=${runId}`;
  await requestThroughProxy(repeatUrl, {
    method: 'POST',
    body: JSON.stringify({ repeat: 'source' })
  });
  const repeatCaptures = await json(`${ui}/api/captures`);
  const repeatCapture = repeatCaptures.captures.find((item) => item.url === repeatUrl);
  if (!repeatCapture) {
    throw new Error('Repeat source capture was not recorded.');
  }
  captureIds.push(repeatCapture.id);
  const repeated = await json(`${ui}/api/repeat`, {
    method: 'POST',
    body: { source: 'capture', id: repeatCapture.id }
  });
  if (!repeated.ok || repeated.target?.url !== repeatUrl) {
    throw new Error(`Repeat did not send the captured request: ${JSON.stringify(repeated)}`);
  }

  const alphaDetail = postCaptureDetails.find((item) => JSON.parse(item.requestBody?.body || '{}').body === 'alpha');
  const betaDetail = postCaptureDetails.find((item) => JSON.parse(item.requestBody?.body || '{}').body === 'beta');

  const alphaRule = await json(`${ui}/api/captures/${alphaDetail.id}/local`, {
    method: 'POST',
    body: { queryMode: 'exact' }
  });
  ruleIds.push(alphaRule.rule.id);
  await json(`${ui}/api/rules/${alphaRule.rule.id}/editor`, {
    method: 'PUT',
    body: {
      responseBody: JSON.stringify({ source: 'local', variant: 'alpha' }, null, 2),
      requestBody: alphaDetail.requestBody.body,
      query: alphaDetail.query,
      queryMode: 'exact'
    }
  });
  const duplicateRemoteRule = await json(`${ui}/api/captures/${alphaDetail.id}/remote-rule`, {
    method: 'POST'
  });
  remoteRuleIds.push(duplicateRemoteRule.rule.id);
  if (duplicateRemoteRule.rule.enabled !== false || !String(duplicateRemoteRule.warning || '').includes('匹配范围重复')) {
    throw new Error(`Duplicate remote rule should be created disabled with a warning: ${JSON.stringify(duplicateRemoteRule)}`);
  }
  const duplicateEnable = await jsonRejects(`${ui}/api/remote-rules/${duplicateRemoteRule.rule.id}`, {
    method: 'PATCH',
    body: { enabled: true }
  });
  if (duplicateEnable.statusCode !== 409 || duplicateEnable.body?.code !== 'RULE_MATCH_CONFLICT') {
    throw new Error(`Duplicate remote rule should not be enabled: ${JSON.stringify(duplicateEnable)}`);
  }
  const duplicateRemoteAiStepId = `ai-smoke-${runId}`;
  const duplicateRemoteAiSave = await json(`${ui}/api/remote-rules/${duplicateRemoteRule.rule.id}/editor`, {
    method: 'PUT',
    body: {
      steps: [{
        id: duplicateRemoteAiStepId,
        type: 'ai',
        enabled: true,
        summary: 'AI smoke',
        prompt: 'noop',
        pythonScript: '# noop',
        aiStatus: '',
        aiOutputLines: []
      }],
      script: ''
    }
  });
  if (!duplicateRemoteAiSave.rule?.steps?.some((step) => step.id === duplicateRemoteAiStepId)) {
    throw new Error(`AI step-only save should not be blocked by duplicate match validation: ${JSON.stringify(duplicateRemoteAiSave)}`);
  }

  const crossDirectionUrlA = `http://127.0.0.1:${targetPort}/api/cross-containment?run=${runId}`;
  const crossDirectionUrlB = `http://127.0.0.1:${targetPort}/api/cross-containment?run=${runId}&case=beta`;
  await requestThroughProxy(crossDirectionUrlA, {
    method: 'POST',
    body: JSON.stringify({ kind: 'cross', detail: 'narrow' })
  });
  await requestThroughProxy(crossDirectionUrlB, {
    method: 'POST',
    body: JSON.stringify({ kind: 'cross' })
  });
  const crossDirectionCaptures = await json(`${ui}/api/captures`);
  const crossDirectionFlatCaptures = flattenCaptureSummaries(crossDirectionCaptures.captures);
  const crossDirectionCaptureA = crossDirectionFlatCaptures.find((item) => item.url === crossDirectionUrlA);
  const crossDirectionCaptureB = crossDirectionFlatCaptures.find((item) => item.url === crossDirectionUrlB);
  if (!crossDirectionCaptureA || !crossDirectionCaptureB) {
    throw new Error(`Cross-direction captures were not recorded: ${JSON.stringify(crossDirectionCaptures.captures.filter((item) => item.path === '/api/cross-containment'))}`);
  }
  captureIds.push(crossDirectionCaptureA.id, crossDirectionCaptureB.id);
  const crossDirectionDetailA = await json(`${ui}/api/captures/${crossDirectionCaptureA.id}`);
  const crossDirectionDetailB = await json(`${ui}/api/captures/${crossDirectionCaptureB.id}`);
  const crossDirectionAlpha = await json(`${ui}/api/captures/${crossDirectionDetailA.id}/local`, {
    method: 'POST',
    body: { queryMode: 'exact' }
  });
  ruleIds.push(crossDirectionAlpha.rule.id);
  await json(`${ui}/api/rules/${crossDirectionAlpha.rule.id}/editor`, {
    method: 'PUT',
    body: {
      responseBody: JSON.stringify({ source: 'local', variant: 'cross-alpha' }, null, 2),
      requestBody: crossDirectionDetailA.requestBody.body,
      query: `run=${runId}`,
      queryMode: 'exact'
    }
  });
  const crossDirectionBeta = await json(`${ui}/api/captures/${crossDirectionDetailB.id}/local`, {
    method: 'POST',
    body: { queryMode: 'exact' }
  });
  ruleIds.push(crossDirectionBeta.rule.id);
  await json(`${ui}/api/rules/${crossDirectionBeta.rule.id}/editor`, {
    method: 'PUT',
    body: {
      responseBody: JSON.stringify({ source: 'local', variant: 'cross-beta' }, null, 2),
      requestBody: crossDirectionDetailB.requestBody.body,
      query: `run=${runId}&case=beta`,
      queryMode: 'exact'
    }
  });
  const crossDirectionRules = await json(`${ui}/api/rules`);
  const savedCrossDirectionBeta = crossDirectionRules.rules.find((item) => item.id === crossDirectionBeta.rule.id);
  if (!savedCrossDirectionBeta || savedCrossDirectionBeta.enabled === false) {
    throw new Error(`Rules with opposite query/body containment directions should not be treated as duplicates: ${JSON.stringify(savedCrossDirectionBeta)}`);
  }

  const betaRule = await json(`${ui}/api/captures/${betaDetail.id}/local`, {
    method: 'POST',
    body: { queryMode: 'exact' }
  });
  ruleIds.push(betaRule.rule.id);
  await json(`${ui}/api/rules/${betaRule.rule.id}/editor`, {
    method: 'PUT',
    body: {
      responseBody: JSON.stringify({ source: 'local', variant: 'beta' }, null, 2),
      requestBody: betaDetail.requestBody.body,
      query: betaDetail.query,
      queryMode: 'exact'
    }
  });

  const localAlpha = await requestThroughProxy(postUrl, {
    method: 'POST',
    body: JSON.stringify({ body: 'alpha' })
  });
  const localBeta = await requestThroughProxy(postUrl, {
    method: 'POST',
    body: JSON.stringify({ body: 'beta' })
  });
  if (!localAlpha.headers['x-easy-http-local'] || !localAlpha.body.includes('"variant": "alpha"')) {
    throw new Error(`POST body alpha did not hit the right local: ${localAlpha.body}`);
  }
  if (!localBeta.headers['x-easy-http-local'] || !localBeta.body.includes('"variant": "beta"')) {
    throw new Error(`POST body beta did not hit the right local: ${localBeta.body}`);
  }
  const repeatedLocalAlpha = await json(`${ui}/api/repeat`, {
    method: 'POST',
    body: { source: 'rule', id: alphaRule.rule.id }
  });
  if (!repeatedLocalAlpha.ok || repeatedLocalAlpha.target?.statusCode !== 200) {
    throw new Error(`Repeat should send the local-rule request through proxy: ${JSON.stringify(repeatedLocalAlpha)}`);
  }

  const created = await json(`${ui}/api/captures/${capture.id}/local`, {
    method: 'POST',
    body: { queryMode: 'exact' }
  });
  ruleId = created.rule.id;
  ruleIds.push(ruleId);

  await json(`${ui}/api/rules/${ruleId}/editor`, {
    method: 'PUT',
    body: {
      responseBody: JSON.stringify({ source: 'local', smoke: true }, null, 2),
      query: `page=edited-${runId}`,
      queryMode: 'exact'
    }
  });

  const editedRules = await json(`${ui}/api/rules`);
  const editedRule = editedRules.rules.find((item) => item.id === ruleId);
  if (editedRule?.query !== `page=edited-${runId}`) {
    throw new Error('Rule query edit was not persisted.');
  }

  const originalQuery = await requestThroughProxy(`http://127.0.0.1:${targetPort}/api/smoke?page=1`);
  if (originalQuery.headers['x-easy-http-local']) {
    throw new Error('Original GET query should not hit after editing the rule query.');
  }

  const localHit = await requestThroughProxy(`http://127.0.0.1:${targetPort}/api/smoke?page=edited-${runId}`);
  if (!localHit.headers['x-easy-http-local']) {
    throw new Error('Edited GET query did not include x-easy-http-local hit header.');
  }
  if (!localHit.body.includes('"source": "local"')) {
    throw new Error(`Unexpected local body: ${localHit.body}`);
  }

  const remoteGetUrl = `http://127.0.0.1:${targetPort}/api/remote-query?run=${runId}`;
  await requestThroughProxy(remoteGetUrl);
  const remoteGetCaptures = await json(`${ui}/api/captures`);
  const remoteGetCapture = remoteGetCaptures.captures.find((item) => item.url === remoteGetUrl);
  if (!remoteGetCapture) {
    throw new Error('Remote GET capture was not recorded.');
  }
  captureIds.push(remoteGetCapture.id);
  const remoteGetCreated = await json(`${ui}/api/captures/${remoteGetCapture.id}/remote-rule`, {
    method: 'POST'
  });
  remoteRuleIds.push(remoteGetCreated.rule.id);
  if (remoteGetCreated.rule.script !== '') {
    throw new Error('New Remote rule should not include default DSL.');
  }
  await json(`${ui}/api/remote-rules/${remoteGetCreated.rule.id}/editor`, {
    method: 'PUT',
    body: {
      query: remoteGetCapture.query,
      queryMode: 'exact',
      script: [
        'change_query remote to "yes"',
        'change_query run to ""',
        `change_req_head x-easy-http-test to "head-${runId}"`,
        'change_req_head x-easy-http-delete to ""',
        '# disabled change_query disabledRemote to "yes"',
        'change_resp_body remote.value to "%22ok%22"',
        'change_resp_body remote.count to "123"',
        'change_resp_body source to ""',
        `change_resp_body data.added[]{add} to "${encodeURIComponent(JSON.stringify({ id: 1 }))}"`,
        `change_resp_body data.reward_list[0] to "${encodeURIComponent(JSON.stringify({ name: 'zero' }))}"`,
        'change_resp_body data.reward_list[1] to ""',
        `change_resp_body data.reward_list[0].tagName to "${encodeURIComponent('"patched"')}"`
      ].join('\n')
    }
  });
  const remoteGet = await requestThroughProxy(remoteGetUrl);
  const remoteGetDeleteHeader = await requestThroughProxy(remoteGetUrl, {
    headers: { 'x-easy-http-delete': `remove-${runId}` }
  });
  const remoteGetBody = JSON.parse(remoteGet.body);
  const remoteGetDeleteHeaderBody = JSON.parse(remoteGetDeleteHeader.body);
  if (remoteGetBody.url !== '/api/remote-query?remote=yes') {
    throw new Error(`Remote query was not changed: ${remoteGet.body}`);
  }
  if (remoteGetBody.requestHeaders?.['x-easy-http-test'] !== `head-${runId}`) {
    throw new Error(`Remote request head was not changed: ${remoteGet.body}`);
  }
  if (remoteGetDeleteHeaderBody.requestHeaders?.['x-easy-http-delete']) {
    throw new Error(`Remote request head empty value should delete header: ${remoteGetDeleteHeader.body}`);
  }
  if (remoteGetBody.url.includes('disabledRemote=yes')) {
    throw new Error(`Disabled Remote command should not run: ${remoteGet.body}`);
  }
  if (Object.prototype.hasOwnProperty.call(remoteGetBody, 'source')) {
    throw new Error(`Remote response body empty value should delete property: ${remoteGet.body}`);
  }
  if (remoteGetBody.remote?.value !== 'ok') {
    throw new Error(`Remote response body was not changed: ${remoteGet.body}`);
  }
  if (remoteGetBody.remote?.count !== 123) {
    throw new Error(`Remote response body value should preserve JSON number type: ${remoteGet.body}`);
  }
  if (remoteGetBody.data?.added?.[0]?.id !== 1) {
    throw new Error(`Remote response body array add did not work: ${remoteGet.body}`);
  }
  if (remoteGetBody.data?.reward_list?.[0]?.name !== 'zero' || remoteGetBody.data?.reward_list?.[0]?.tagName !== 'patched') {
    throw new Error(`Remote response body array set/index did not work: ${remoteGet.body}`);
  }
  if (remoteGetBody.data?.reward_list?.length !== 1) {
    throw new Error(`Remote response body empty array index value should delete item: ${remoteGet.body}`);
  }

  const remotePostUrl = `http://127.0.0.1:${targetPort}/api/remote-body?run=${runId}`;
  const remotePostUrlVariant = `http://127.0.0.1:${targetPort}/api/remote-body?run=${runId}&variant=latest`;
  const remotePostOriginalBodyText = JSON.stringify({
    input: 'old',
    data: {
      reward_list: [
        { name: 'old-zero' },
        { name: 'keep-one' }
      ]
    }
  });
  const remotePostMatchBody = {
    input: 'match',
    data: {
      reward_list: [
        { name: 'old-zero' },
        { name: 'keep-one' }
      ]
    }
  };
  const remotePostMatchBodyText = JSON.stringify(remotePostMatchBody);
  const remotePostMatchBodyForEditor = JSON.stringify(remotePostMatchBody, null, 2);
  await requestThroughProxy(remotePostUrl, {
    method: 'POST',
    body: remotePostOriginalBodyText
  });
  const remotePostCaptures = await json(`${ui}/api/captures`);
  const remotePostCapture = remotePostCaptures.captures.find((item) => item.url === remotePostUrl);
  if (!remotePostCapture) {
    throw new Error('Remote POST capture was not recorded.');
  }
  captureIds.push(remotePostCapture.id);
  const remotePostCreated = await json(`${ui}/api/captures/${remotePostCapture.id}/remote-rule`, {
    method: 'POST'
  });
  remoteRuleIds.push(remotePostCreated.rule.id);
  const remotePostEdited = await json(`${ui}/api/remote-rules/${remotePostCreated.rule.id}/editor`, {
    method: 'PUT',
    body: {
      query: remotePostCapture.query,
      queryMode: 'exact',
      requestBody: remotePostMatchBodyForEditor,
      script: [
        'change_query remotePost to "yes"',
        'change_req_body input to "%22new%22"',
        'change_req_body amount to "123"',
        `change_req_body bodyItems[]{add} to "${encodeURIComponent(JSON.stringify({ id: 1 }))}"`,
        `change_req_body data.reward_list[0] to "${encodeURIComponent(JSON.stringify({ name: 'zero' }))}"`,
        `change_req_body data.reward_list[0].tagName to "${encodeURIComponent('"patched"')}"`,
        'change_resp_body remote.value to "%22changed%22"'
      ].join('\n')
    }
  });
  if (remotePostEdited.rule.requestContentType !== 'application/json') {
    throw new Error(`Remote request body JSON content type was not inferred: ${remotePostEdited.rule.requestContentType}`);
  }
  await requestThroughProxy(remotePostUrlVariant, {
    method: 'POST',
    headers: { 'x-latest-capture': `latest-${runId}` },
    body: JSON.stringify({ input: 'latest-capture' })
  });
  const remotePostVariantCaptures = await json(`${ui}/api/captures`);
  const remotePostVariantCapture = remotePostVariantCaptures.captures.find((item) => item.url === remotePostUrlVariant);
  if (!remotePostVariantCapture) {
    throw new Error('Remote POST variant capture was not recorded.');
  }
  captureIds.push(remotePostVariantCapture.id);
  const remotePostUpdated = await json(`${ui}/api/captures/${remotePostVariantCapture.id}/remote-rule`, {
    method: 'POST'
  });
  remoteRuleIds.push(remotePostUpdated.rule.id);
  if (remotePostUpdated.rule.id === remotePostCreated.rule.id) {
    throw new Error('Repeated Remote save with a different request body should create a separate rule.');
  }
  const remoteRulesAfterVariant = await json(`${ui}/api/remote-rules`);
  const originalRemotePostRule = remoteRulesAfterVariant.rules.find((item) => item.id === remotePostCreated.rule.id);
  if (!originalRemotePostRule) {
    throw new Error('Repeated Remote save should keep the original body-specific rule.');
  }
  if (originalRemotePostRule.script !== remotePostEdited.rule.script) {
    throw new Error('Repeated Remote save should not overwrite edited DSL script on the original rule.');
  }
  if (originalRemotePostRule.query !== remotePostEdited.rule.query || originalRemotePostRule.queryMode !== remotePostEdited.rule.queryMode) {
    throw new Error('Repeated Remote save should not overwrite edited query matching config on the original rule.');
  }
  if (originalRemotePostRule.requestBodyHash !== remotePostEdited.rule.requestBodyHash) {
    throw new Error('Repeated Remote save should not overwrite edited request body match config on the original rule.');
  }
  if (remotePostUpdated.rule.requestHeaders?.['x-latest-capture'] !== `latest-${runId}`) {
    throw new Error('Repeated Remote save should store latest request header snapshot on the new rule.');
  }
  const remotePostMismatch = await requestThroughProxy(remotePostUrl, {
    method: 'POST',
    body: remotePostOriginalBodyText
  });
  const remotePostMismatchBody = JSON.parse(remotePostMismatch.body);
  if (remotePostMismatchBody.url !== `/api/remote-body?run=${runId}` || remotePostMismatchBody.remote) {
    throw new Error(`Remote POST should not map when request body does not match: ${remotePostMismatch.body}`);
  }
  const remotePost = await requestThroughProxy(remotePostUrl, {
    method: 'POST',
    body: remotePostMatchBodyText
  });
  const remotePostBody = JSON.parse(remotePost.body);
  const changedRequestBody = JSON.parse(remotePostBody.requestBody);
  if (remotePostBody.url !== `/api/remote-body?run=${runId}&remotePost=yes`) {
    throw new Error(`Remote POST query should change only after request body match: ${remotePost.body}`);
  }
  if (changedRequestBody.input !== 'new') {
    throw new Error(`Remote request body was not changed: ${remotePost.body}`);
  }
  if (changedRequestBody.amount !== 123) {
    throw new Error(`Remote request body value should preserve JSON number type: ${remotePost.body}`);
  }
  if (changedRequestBody.bodyItems?.[0]?.id !== 1) {
    throw new Error(`Remote request body array add did not work: ${remotePost.body}`);
  }
  if (changedRequestBody.data?.reward_list?.[0]?.name !== 'zero' || changedRequestBody.data?.reward_list?.[0]?.tagName !== 'patched') {
    throw new Error(`Remote request body array set/index did not work: ${remotePost.body}`);
  }
  if (changedRequestBody.data?.reward_list?.[1]?.name !== 'keep-one') {
    throw new Error(`Remote request body array set0 should preserve other items: ${remotePost.body}`);
  }
  if (remotePostBody.remote?.value !== 'changed') {
    throw new Error(`Remote POST response body was not changed: ${remotePost.body}`);
  }
  const finalCaptures = await json(`${ui}/api/captures`);
  captureIds.push(...finalCaptures.captures
    .filter((item) => item.path === '/api/remote-body' && String(item.query || '').includes(`run=${runId}`))
    .map((item) => item.id));

  if (process.env.DESTRUCTIVE_SMOKE === '1') {
    await json(`${ui}/api/captures`, { method: 'DELETE' });
    const clearedCaptures = await json(`${ui}/api/captures`);
    if (clearedCaptures.captures.length !== 0) {
      throw new Error('Clear captures endpoint should remove all recent requests.');
    }
    captureIds.length = 0;
    captureId = null;
  }

  console.log('Smoke test passed.');
} finally {
  await cleanup();
  server.close();
}

function listen(serverToListen, port) {
  return new Promise((resolve, reject) => {
    serverToListen.once('error', reject);
    serverToListen.listen(port, resolve);
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function json(url, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body ? JSON.stringify(options.body) : undefined;
    const req = http.request(url, {
      method: options.method || 'GET',
      headers: body ? {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body)
      } : undefined
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`${res.statusCode} ${data}`));
          return;
        }
        resolve(data ? JSON.parse(data) : null);
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function jsonRejects(url, options = {}) {
  try {
    const result = await json(url, options);
    throw new Error(`Expected request to fail, got ${JSON.stringify(result)}`);
  } catch (error) {
    const match = /^(\d+)\s+([\s\S]*)$/.exec(error.message || '');
    if (!match) throw error;
    let parsed = {};
    try {
      parsed = JSON.parse(match[2]);
    } catch {
      parsed = { raw: match[2] };
    }
    return {
      statusCode: Number(match[1]),
      body: parsed
    };
  }
}

function requestThroughProxy(targetUrl, options = {}) {
  const parsedTarget = new URL(targetUrl);
  const body = options.body || '';
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: 8899,
      method: options.method || 'GET',
      path: targetUrl,
      headers: {
        host: parsedTarget.host,
        ...(options.headers || {}),
        ...(body ? {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body)
        } : {})
      }
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function jsonTextEqual(a, b) {
  try {
    return JSON.stringify(JSON.parse(a || '')) === JSON.stringify(JSON.parse(b || ''));
  } catch {
    return String(a || '') === String(b || '');
  }
}

function flattenCaptureSummaries(captures = []) {
  return (captures || []).flatMap((capture) => [
    capture,
    ...(Array.isArray(capture.history) ? capture.history : [])
  ]);
}

async function cleanup() {
  await json(`${ui}/api/settings`, {
    method: 'PATCH',
    body: {
      captureFilter: originalSettings.captureFilter || '',
      displayFilter: originalSettings.displayFilter || '',
      captureMergeRules: originalSettings.captureMergeRules || {},
      captureMergeEnabled: originalSettings.captureMergeEnabled !== false,
      captureTreeViewEnabled: originalSettings.captureTreeViewEnabled === true,
      showListNotes: originalSettings.showListNotes !== false,
      captureTabs: Array.isArray(originalSettings.captureTabs) ? originalSettings.captureTabs : [],
      activeCaptureTabId: originalSettings.activeCaptureTabId || '',
      domainHistory: Array.isArray(originalSettings.domainHistory) ? originalSettings.domainHistory : [],
      domainProjectsInitialized: originalSettings.domainProjectsInitialized === true,
      requireDomainHistorySelection: originalSettings.requireDomainHistorySelection === true
    }
  }).catch(() => {});

  for (const id of new Set(ruleIds.concat(ruleId).filter(Boolean))) {
    await deleteIfExists(`${ui}/api/rules/${id}`);
  }
  for (const id of new Set(remoteRuleIds.filter(Boolean))) {
    await deleteIfExists(`${ui}/api/remote-rules/${id}`);
  }
  for (const id of new Set(captureIds.concat(captureId).filter(Boolean))) {
    await deleteIfExists(`${ui}/api/captures/${id}`);
  }
}

function deleteIfExists(url) {
  return new Promise((resolve) => {
    const req = http.request(url, { method: 'DELETE' }, () => {
      resolve();
    });
    req.on('error', () => {
      resolve();
    });
    req.end();
  });
}
