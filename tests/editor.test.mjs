import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import { webcrypto } from 'node:crypto';

// Minimal immutable record interface used by Decap's preSave event.
class Record {
  constructor(data) { this.data = data; }
  get(key) { return this.data[key]; }
  set(key, value) { return new Record({ ...this.data, [key]: value }); }
  update(key, update) { return this.set(key, update(this.get(key))); }
  clear() { return new Record({}); }
  merge(data) { return new Record({ ...this.data, ...data }); }
}
class Sequence extends Array {
  get(index) { return this[index]; }
  clear() { return new Sequence(); }
  set(index, value) { const copy = this.slice(); copy[index] = value; return copy; }
}
async function editor(demo = true) {
  let save;
  const widgets = {}, previews = {};
  class ImageControl {
    constructor(props) { this.props = props; this.controlID = 'original-control'; this.state = { keys: [], itemsCollapsed: [] }; }
    componentDidUpdate() { this.originalUpdateCalled = true; }
    setState(state) { Object.assign(this.state, state); }
    handleChangeFor() { return () => {}; }
  }
  const CMS = {
    getWidget: () => ({ control: ImageControl }),
    registerWidget: (name, control) => { widgets[name] = control; },
    registerEventListener: ({ handler }) => { save = handler; },
    registerPreviewTemplate(name, preview) { previews[name] = preview; }, init() {}
  };
  const startup = { remove() {} };
  const context = vm.createContext({ CMS, window: { CMS },
    document: { getElementById: () => startup },
    location: { hostname: demo ? 'localhost' : 'slickestfox.com', search: demo ? '?demo=1' : '' }, URLSearchParams, Date, Map, File, crypto: webcrypto,
    h: (tag, props, ...children) => ({ tag, props, children }),
    fetch: async () => ({ ok: true, json: async () => ({ backend: { base_url: 'https://auth.example', repo: 'Josuero667/slickestfox-website', branch: 'main' } }) }) });
  await vm.runInContext(await fs.readFile('admin/editor.js', 'utf8'), context);
  assert.equal(startup.textContent, undefined);
  return { Control: widgets.image, ListControl: widgets.list, previews, saveEntry: save, save: items => save({ entry: new Record({ collection: 'artwork',
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

test('batch uploads prepend entries, preserve original titles and dates, and avoid filename collisions', async () => {
  const { ListControl, save } = await editor();
  const fields = Sequence.of(new Record({ name: 'src' }));
  let result;
  const names = [];
  const control = new ListControl({ field: new Record({ fields }), value: Sequence.of(new Record({ title: 'Existing', date: '2020-01-01' })),
    entry: new Record({ data: new Record({}) }), onChange: value => { result = value; },
    onPersistMedia: async file => { names.push(file.name); return { payload: { path: `assets/art/uploads/${file.name}` } }; },
    getAsset: path => ({ path, toString: () => 'blob:preview' }) });
  const modified = new Date(2023, 6, 12, 12).getTime();
  await control.uploadBatch([new File(['a'], 'My Art.png', { lastModified: modified }), new File(['b'], 'My Art.png', { lastModified: modified })]);
  assert.equal(result.length, 3);
  assert.equal(result[0].get('title'), 'My Art');
  assert.equal(result[1].get('date'), '2023-07-12');
  assert.equal(result[2].get('title'), 'Existing');
  assert.notEqual(names[0], names[1]);
  assert.equal(save(result.map(item => item.data))[0].date, '2023-07-12');
});

test('failed batch items are reported while successful uploads remain editable', async () => {
  const { ListControl } = await editor();
  let result;
  const control = new ListControl({ field: new Record({ fields: Sequence.of(new Record({ name: 'src' })) }),
    value: new Sequence(), entry: new Record({ data: new Record({}) }), onChange: value => { result = value; },
    onPersistMedia: async file => ({ payload: { path: `assets/art/uploads/${file.name}` } }),
    getAsset: path => ({ path, toString: () => 'blob:preview' }) });
  await control.uploadBatch([new File(['a'], 'ok.png'), new File(['b'], 'bad.exe')]);
  assert.equal(result.length, 1);
  assert.match(control.state.uploadMessage, /bad.exe: unsupported image format/);
  assert.equal(control.state.uploadBusy, false);
});

test('single-image selection fills blank titles and preserves custom titles', async () => {
  const { ListControl } = await editor();
  const file = new File(['a'], 'Original Name.png', { lastModified: new Date(2022, 2, 4, 12).getTime() });
  let value = Sequence.of(new Record({}));
  const control = new ListControl({ field: new Record({ bulk_artwork: true }), value,
    getAsset: path => ({ path, fileObj: file, toString: () => 'blob:test' }),
    onChange: next => { value = next; control.props.value = next; } });
  control.state.keys = ['stable'];
  control.handleChangeFor(0)(new Record({ name: 'src' }), 'assets/art/uploads/a.png');
  assert.equal(value[0].get('title'), 'Original Name');
  assert.equal(value[0].get('date'), '2022-03-04');
  control.props.value = value.set(0, value[0].set('title', 'Custom'));
  control.handleChangeFor(0)(new Record({ name: 'src' }), 'assets/art/uploads/b.png');
  assert.equal(value[0].get('title'), 'Custom');
});

test('existing images link to raw file bytes, including spaces, instead of GitHub HTML pages', async () => {
  const { Control } = await editor(false);
  const control = new Control({ value: 'assets/art/main/My Art #1.png', getAsset: () => ({ path: 'empty.svg' }), field: {} });
  const link = control.renderImages();
  assert.equal(link.props.href, 'https://raw.githubusercontent.com/Josuero667/slickestfox-website/main/assets/art/main/My%20Art%20%231.png');
  assert.equal(link.children[0].props.src, link.props.href);
});

test('music IDs are generated without replacing existing IDs and duplicates fail', async () => {
  const { saveEntry } = await editor();
  const save = items => saveEntry({ entry: new Record({ collection: 'music', data: new Record({ releases: items.map(item => new Record(item)) }) }) }).get('releases');
  assert.match(save([{ title: 'New' }])[0].get('id'), /^release-/);
  assert.equal(save([{ id: 'sk-001' }])[0].get('id'), 'sk-001');
  assert.throws(() => save([{ id: 'same' }, { id: 'same' }]), /Duplicate release ID/);
});
