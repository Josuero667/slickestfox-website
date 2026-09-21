import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';

// Minimal immutable record interface used by Decap's preSave event.
class Record {
  constructor(data) { this.data = data; }
  get(key) { return this.data[key]; }
  set(key, value) { return new Record({ ...this.data, [key]: value }); }
  update(key, update) { return this.set(key, update(this.get(key))); }
}
async function editor() {
  let Control, save;
  class ImageControl {
    constructor(props) { this.props = props; this.controlID = 'original-control'; }
    componentDidUpdate() { this.originalUpdateCalled = true; }
  }
  const CMS = {
    getWidget: () => ({ control: ImageControl }),
    registerWidget: (_name, control) => { Control = control; },
    registerEventListener: ({ handler }) => { save = handler; },
    registerPreviewTemplate() {}, init() {}
  };
  const startup = { remove() {} };
  const context = vm.createContext({ CMS, window: { CMS },
    document: { getElementById: () => startup },
    location: { hostname: 'localhost', search: '?demo=1' }, URLSearchParams, Date, Map,
    fetch: async () => ({ ok: true, json: async () => ({ backend: {} }) }) });
  await vm.runInContext(await fs.readFile('admin/editor.js', 'utf8'), context);
  assert.equal(startup.textContent, undefined);
  return { Control, save: items => save({ entry: new Record({ collection: 'artwork',
    data: new Record({ images: items.map(item => new Record(item)) }) }) }).get('images').map(item => item.data) };
}

test('image control preserves Decap media identity and captures original file date', async () => {
  const { Control, save } = await editor();
  const modified = new Date(2023, 6, 12, 12).getTime();
  const control = new Control({ value: '/assets/art/uploads/test.png', getAsset: () => ({ path: 'assets/art/uploads/test.png', fileObj: { lastModified: modified } }) });
  assert.equal(control.controlID, 'original-control');
  control.componentDidUpdate({ value: '' });
  assert.equal(control.originalUpdateCalled, true);
  const [item] = save([{ src: control.props.value, title: 'Test' }]);
  assert.equal(item.date, '2023-07-12');
  assert.equal(item.year, '2023');
  assert.equal(item.file_modified, new Date(modified).toISOString());
});

test('unrelated edits keep stored dates; manual overrides survive fresh uploads', async () => {
  const { Control, save } = await editor();
  const path = '/assets/art/uploads/test.png';
  const control = new Control({ value: path, getAsset: () => ({ path, fileObj: { lastModified: Date.now() } }) });
  control.componentDidUpdate({ value: path });
  assert.equal(save([{ src: path, date: '2020-01-02' }])[0].date, '2020-01-02');
  control.componentDidUpdate({ value: '' });
  assert.equal(save([{ src: path, date: '2020-01-02', date_override: true }])[0].date, '2020-01-02');
});

test('missing original date is an error rather than an upload-time fallback', async () => {
  const { save } = await editor();
  assert.throws(() => save([{ src: '/assets/art/uploads/existing.png', title: 'Existing' }]), /Choose a file/);
});
