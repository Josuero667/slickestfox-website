/* global CMS, h */
(async () => {
  const startup = document.getElementById('startup');
  try {
    if (!window.CMS) throw new Error('The editor could not load. Check your connection and reload.');
    const response = await fetch('config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('The editor configuration could not be loaded.');
    const config = await response.json();
    const demo = ['localhost', '127.0.0.1'].includes(location.hostname) &&
      new URLSearchParams(location.search).get('demo') === '1';
    if (demo) config.backend = { name: 'test-repo' };
    else if (!config.backend.base_url) {
      startup.innerHTML = '<h1>Your editor is ready for setup</h1><p>The GitHub sign-in connection still needs to be activated. Once connected, you can upload artwork, publish posts, and open or close commissions here.</p><p><a href="/">Return to the website</a></p>';
      return;
    }

    // Keep the original browser File timestamp. Git checkouts do not preserve it.
    const uploadDates = new Map();
    const ImageControl = CMS.getWidget('image').control;
    class DatedImageControl extends ImageControl {
      capture(path) {
        if (!path) return;
        let asset = this.props.getAsset(path, this.props.field);
        // Root-relative public URLs may bypass Decap's in-memory upload cache.
        if (!asset?.fileObj) asset = this.props.getAsset(path.split('/').pop(), this.props.field);
        if (!asset?.path || asset.path.replace(/^\/+/, '') !== path.replace(/^\/+/, '')) return;
        const modified = asset && asset.fileObj && asset.fileObj.lastModified;
        if (Number.isFinite(modified) && modified > 0) {
          const d = new Date(modified);
          const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          uploadDates.set(path, { date, modified: d.toISOString() });
        }
      }
      componentDidUpdate(previous) {
        super.componentDidUpdate();
        if (previous.value !== this.props.value) this.capture(this.props.value);
      }
    }
    CMS.registerWidget('image', DatedImageControl, CMS.getWidget('image').preview);

    CMS.registerEventListener({ name: 'preSave', handler: ({ entry }) => {
      let data = entry.get('data');
      if (entry.get('collection') !== 'artwork') return data;
      return data.update('images', images => images.map(item => {
        const uploaded = uploadDates.get(item.get('src'));
        if (uploaded) {
          item = item.set('file_modified', uploaded.modified);
          if (!item.get('date_override')) item = item.set('date', uploaded.date);
        }
        const date = item.get('date');
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          throw new Error(`Choose a file from your computer or set a date for “${item.get('title') || 'Untitled artwork'}”.`);
        }
        return item.set('year', date.slice(0, 4));
      }));
    }});

    CMS.registerPreviewTemplate('gallery', ({ entry, getAsset }) => {
      const data = entry.get('data').toJS();
      return h('main', { style: { fontFamily: 'system-ui', padding: 24 } },
        h('h1', {}, 'Artwork'),
        h('p', {}, 'Save to publish. Optimized previews and automatic colors are prepared during deployment.'),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 16 } },
          ...(data.images || []).map((item, index) => h('figure', { key: index, style: { margin: 0, opacity: item.published === false ? 0.4 : 1 } },
            item.src ? h('img', { src: String(getAsset(item.src)), style: { width: '100%', height: 150, objectFit: 'contain' } }) : null,
            h('figcaption', {}, `${item.title || 'Untitled'} · ${item.date || 'Date from uploaded file'}`)))));
    });
    CMS.init({ config: { ...config, load_config_file: false } });
    startup.remove();
  } catch (error) {
    startup.textContent = error.message;
  }
})();
