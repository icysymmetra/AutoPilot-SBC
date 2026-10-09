// Run with node --test tests/fc27-web-app-hooks.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('page/ea-data-bridge.js', 'utf8');
const loadConstants = (names, globals = {}) => {
  const context = vm.createContext(globals);
  for (const name of names) {
    const start = source.indexOf(`  const ${name} =`);
    assert.ok(start >= 0, `Missing ${name}`);
    const next = /\n  const /g;
    next.lastIndex = start + 1;
    const end = next.exec(source)?.index ?? source.length;
    vm.runInContext(`${source.slice(start, end)}\nthis.${name} = ${name};`, context);
  }
  return context;
};
const mountSource = source.slice(
  source.indexOf('  const ensureSolveButton ='),
  source.indexOf('  const cleanupSolveButton ='),
);

class Element {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.className = '';
    this.children = [];
    this.listeners = {};
    this.disabled = false;
    this.classList = {
      add: (...names) => { this.className += ` ${names.join(' ')}`; },
      contains: name => this.className.split(/\s+/).includes(name),
    };
  }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.append(node); return node; }
  contains(node) { return this.children.includes(node); }
  setAttribute() {}
  addEventListener(name, callback) { this.listeners[name] = callback; }
  querySelector() { return this.reference ?? null; }
}

test('Solve Squad stays interactive when EA Exchange Players is disabled', () => {
  const root = new Element();
  root.reference = new Element('button');
  root.reference.className = 'btn-standard call-to-action disabled';
  const context = vm.createContext({
    document: { createElement: tag => new Element(tag), createElementNS: (_, tag) => new Element(tag) },
    ensureSolveButtonStyles() {},
    syncMultiSolveButtonForChallenge() {},
    currentChallenge: null,
  });
  vm.runInContext(`${mountSource}\nthis.mount = ensureSolveButton;`, context);
  const view = { __content: root };
  context.mount(view, { id: 27 });
  assert.ok(view.__eaDataSolveButton);
  assert.equal(view.__eaDataSolveButton.classList.contains('disabled'), false,
    'EA disabled state must not disable the extension solver');
  assert.equal(view.__eaDataSolveButton.disabled, false);
  assert.equal(view.__eaDataSolveButton.type, 'button');
  assert.equal(typeof view.__eaDataSolveButton.listeners.click, 'function');
  context.mount(view, { id: 28 });
  assert.equal(root.children.length, 1, 'Repeated renders must keep one wrapper');
});

test('EA response envelopes retain arrays and use the branch with collection data', () => {
  const { unwrapObservablePayload: unwrap } = loadConstants(['isPlainObject', 'unwrapObservablePayload']);
  const items = [{ id: 27 }];
  assert.equal(unwrap({ data: null, response: items }), items);
  assert.equal(unwrap({ data: items, response: null }), items);
  const response = { items };
  assert.equal(unwrap({ data: { status: 200 }, response }), response);
  const data = { sets: items };
  assert.equal(unwrap({ data, response: { status: 200 } }), data);
});

test('FC27 item piles and requirement keys use EA runtime enums', () => {
  const piles = { CLUB: 7, STORAGE: 10, INBOX: 8, TRANSFER: 5 };
  const keys = { 40: 'ACADEMY_PLAYER_SLOTTING', 41: 'PLAYER_ATTRIBUTE' };
  const context = loadConstants(['resolveItemPileEnum', 'resolveEligibilityKeyEnum'], {
    window: { ItemPile: piles, SBCEligibilityKey: keys }, services: {},
    LOCAL_SBC_ELIGIBILITY_KEY_ENUM: {},
  });
  assert.equal(context.resolveItemPileEnum(), piles);
  assert.equal(context.resolveEligibilityKeyEnum(), keys);
});

test('FC27 unassigned fetching works without the removed getUnassignedItems method', async () => {
  const items = [{ id: 27 }];
  const service = { calls: 0, requestUnassignedItems() {
    assert.equal(this, service);
    this.calls++;
    return { data: { items } };
  } };
  const context = loadConstants([
    'markItemsAsUnassigned', 'extractUnassignedItemsFromResult', 'getUnassignedItems',
  ], {
    services: { Item: service },
    observableToPromise: async value => value,
    sbcApiCall: async (_, fn) => fn(),
  });
  const result = await context.getUnassignedItems();
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 27);
  assert.equal(result[0].isUnassigned, true);
  assert.equal(service.calls, 1);
});

test('FC27 transfer list includes available and expired items, excluding live and sold auctions', async () => {
  const auction = state => ({ isInactive: () => state === 'inactive', isExpired: () => state === 'expired', isSold: () => state === 'sold' });
  const items = ['inactive', 'expired', 'active', 'sold'].map((state, index) => ({ id: index + 1, getAuctionData: () => auction(state) }));
  const service = { requestTransferItems() {
    assert.equal(this, service);
    return { data: { items } };
  } };
  const context = loadConstants(['getTransferListItems'], {
    services: { Item: service },
    observableToPromise: async value => value,
  });
  const result = await context.getTransferListItems();
  assert.deepEqual(Array.from(result.availableItems, item => item.id), [1]);
  assert.deepEqual(Array.from(result.unSoldItems, item => item.id), [2]);
});
