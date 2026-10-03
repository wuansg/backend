import assert from 'node:assert/strict';

import { stripRetiredNotificationEvents } from '@common/config/app-config/retired-notification-events';
import { NODE_PLUGINS_ROUTES } from '@libs/contracts/api';
import { EVENTS } from '@libs/contracts/constants';
import { NodePluginEditorSchema } from '@libs/node-plugins/models';

import {
    collectSharedListReferences,
    injectSharedLists,
    validateSharedListReferences,
    orderNodePluginsConfig,
} from '@modules/node-plugins/utils';

const oldConfig = {
    torrentBlocker: { enabled: true, ignoreLists: { ip: ['ext:deleted-list'] } },
    connectionDrop: { enabled: true, whitelistIps: ['ext:deleted-list'] },
    ingressFilter: { enabled: true, blockedIps: ['ext:active-list'] },
    egressFilter: { enabled: true, blockedPorts: [25], blockedIps: [] },
};
const sharedLists = [
    { name: 'active-list', config: { type: 'ipList', items: ['198.51.100.1'] } },
] as never;
const normalized = injectSharedLists(oldConfig, sharedLists);
assert.equal('torrentBlocker' in normalized, false);
assert.equal('connectionDrop' in normalized, false);
assert.deepEqual(normalized.ingressFilter, oldConfig.ingressFilter);
assert.deepEqual(normalized.egressFilter, oldConfig.egressFilter);
assert.deepEqual([...collectSharedListReferences(oldConfig)], ['active-list']);
assert.deepEqual(validateSharedListReferences(oldConfig, sharedLists), []);
assert.equal('torrentBlocker' in orderNodePluginsConfig(oldConfig), false);
assert.equal('connectionDrop' in orderNodePluginsConfig(oldConfig), false);
assert.equal(oldConfig.torrentBlocker.enabled, true, 'Do not mutate historical records');
assert.equal('torrentBlocker' in NodePluginEditorSchema.parse(oldConfig), false);
assert.equal('connectionDrop' in NodePluginEditorSchema.shape, false);
assert.equal('TORRENT_BLOCKER' in NODE_PLUGINS_ROUTES, false);
assert.equal('TORRENT_BLOCKER' in EVENTS, false);
const events = {
    'torrent_blocker.report': { telegram: true },
    'node.connected': { webhook: true },
    invalid: {},
};
assert.deepEqual(stripRetiredNotificationEvents(events), {
    'node.connected': { webhook: true },
    invalid: {},
});
assert.ok('torrent_blocker.report' in events);
assert.equal(stripRetiredNotificationEvents(null), null);
console.log('Retired plugin compatibility and shared filter regressions passed');
