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
    let activeBatches = 0;
    const cleanPath = path => String(path || '').replace(/^\/+/, '');
    const fileTitle = name => String(name || '').split('/').pop().replace(/\.[^.]+$/, '');
    const fileInfo = file => {
      const d = new Date(file.lastModified);
      return { date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        modified: d.toISOString(), title: fileTitle(file.name) };
    };
    const sourceURL = path => {
      if (/^(https?:|blob:|data:image\/)/i.test(path)) return path;
      const encoded = cleanPath(path).split('/').map(encodeURIComponent).join('/');
      return demo ? `/${encoded}` : `https://raw.githubusercontent.com/${config.backend.repo}/${config.backend.branch}/${encoded}`;
    };
    const previewURL = (path, getAsset, field) => {
      if (!path) return '';
      const upload = uploadDates.get(cleanPath(path));
      if (upload?.url) return upload.url;
      // Resolve against the image's actual directory, not the default upload folder.
      // Originals live in GitHub; the public site only has generated display copies.
      const asset = getAsset && field ? getAsset(path, field) : null;
      if (asset && cleanPath(asset.path) === cleanPath(path) && String(asset).startsWith('blob:')) return String(asset);
      return sourceURL(path);
    };
    const ImageControl = CMS.getWidget('image').control;
    class DatedImageControl extends ImageControl {
      constructor(props) {
        super(props);
        this.renderImages = () => {
          const url = previewURL(this.props.value, this.props.getAsset, this.props.field);
          return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', title: 'Open image' },
            h('img', { src: url, alt: 'Selected image', style: { maxWidth: '100%', height: 150, objectFit: 'contain' } }));
        };
      }
      capture(path) {
        if (!path) return;
        let asset = this.props.getAsset(path, this.props.field);
        // Root-relative public URLs may bypass Decap's in-memory upload cache.
        if (!asset?.fileObj) asset = this.props.getAsset(path.split('/').pop(), this.props.field);
        if (!asset?.path || asset.path.replace(/^\/+/, '') !== path.replace(/^\/+/, '')) return;
        const modified = asset && asset.fileObj && asset.fileObj.lastModified;
        if (Number.isFinite(modified) && modified > 0) {
          uploadDates.set(cleanPath(path), { ...fileInfo(asset.fileObj), url: String(asset) });
        }
      }
      componentDidUpdate(previous) {
        super.componentDidUpdate();
        if (previous.value !== this.props.value) this.capture(this.props.value);
      }
    }
    CMS.registerWidget('image', DatedImageControl, CMS.getWidget('image').preview);

    const ListControl = CMS.getWidget('list').control;
    class ArtworkListControl extends ListControl {
      handleChangeFor(index) {
        const original = super.handleChangeFor(index);
        const key = this.state.keys[index];
        return (field, value, metadata) => {
          if (!this.props.field.get('bulk_artwork') || field.get('name') !== 'src' || !value) return original(field, value, metadata);
          const current = this.state.keys.indexOf(key);
          if (current < 0) return;
          let item = this.props.value.get(current).set('src', value);
          const asset = this.props.getAsset(value, field);
          const file = asset && cleanPath(asset.path) === cleanPath(value) ? asset.fileObj : null;
          if (!item.get('title')) item = item.set('title', fileTitle(file?.name || value));
          if (file?.lastModified > 0) {
            const info = fileInfo(file);
            uploadDates.set(cleanPath(value), { ...info, url: String(asset) });
            item = item.set('file_modified', info.modified);
            if (!item.get('date_override')) item = item.set('date', info.date).set('year', info.date.slice(0, 4));
          }
          this.props.onChange(this.props.value.set(current, item), metadata);
        };
      }

      async uploadBatch(files) {
        if (!files.length || this.state.uploadBusy) return;
        activeBatches++;
        this.setState({ uploadBusy: true, uploadMessage: 'Preparing artwork…' });
        const records = [], failures = [];
        const field = this.props.field.get('fields').find(f => f.get('name') === 'src');
        for (const [index, file] of files.entries()) {
          this.setState({ uploadMessage: `Preparing ${index + 1} of ${files.length}: ${file.name}` });
          try {
            if (!/\.(png|jpe?g|webp|gif|avif)$/i.test(file.name)) throw new Error('unsupported image format');
            if (file.size > 40000000) throw new Error('larger than 40 MB');
            if (!(file.lastModified > 0)) throw new Error('missing file modification date');
            // Unique names keep two same-named selections from overwriting each other.
            const extension = file.name.split('.').pop().toLowerCase();
            const stem = fileTitle(file.name).replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 100) || 'artwork';
            const named = new File([file], `${stem}-${crypto.randomUUID()}.${extension}`, { type: file.type, lastModified: file.lastModified });
            const result = await this.props.onPersistMedia(named, { field });
            const media = result?.payload?.file?.path ? result.payload.file : result?.payload;
            if (!media?.path) throw new Error('upload failed; please retry');
            const info = fileInfo(file);
            const asset = this.props.getAsset(media.path, field);
            uploadDates.set(cleanPath(media.path), { ...info, url: String(asset) });
            records.push(this.props.entry.get('data').clear().merge({ title: info.title, src: media.path,
              date: info.date, file_modified: info.modified, year: info.date.slice(0, 4), published: true, date_override: false }));
          } catch (error) { failures.push(`${file.name}: ${error.message}`); }
        }
        if (records.length) {
          const old = this.props.value || this.props.field.get('fields').clear();
          this.setState({ listCollapsed: false, keys: [...records.map(() => crypto.randomUUID()), ...this.state.keys],
            itemsCollapsed: [...records.map(() => true), ...this.state.itemsCollapsed] });
          this.props.onChange(old.clear().concat(records).concat(old));
        }
        activeBatches--;
        this.setState({ uploadBusy: false, uploadMessage: `${records.length} artwork added at the top. Review, then Publish. ${failures.join('; ')}` });
      }

      render() {
        const list = super.render();
        if (!this.props.field.get('bulk_artwork')) return list;
        return h('div', {},
          h('div', { style: { padding: 16, background: '#edf5ff', borderRadius: 8, marginBottom: 12 } },
            h('label', {}, 'Upload multiple artworks', h('input', { type: 'file', multiple: true,
              accept: '.png,.jpg,.jpeg,.webp,.gif,.avif', disabled: !!this.state.uploadBusy,
              style: { display: 'block', marginTop: 8 }, onChange: event => {
                const files = Array.from(event.target.files || []); event.target.value = ''; this.uploadBatch(files);
              } })),
            h('p', { role: 'status' }, this.state.uploadMessage || 'Choose one or more files. Titles and dates are filled in automatically.')),
          h('fieldset', { disabled: !!this.state.uploadBusy, style: { border: 0, padding: 0, minWidth: 0 } }, list));
      }
    }
    CMS.registerWidget('list', ArtworkListControl, CMS.getWidget('list').preview);

    const FileControl = CMS.getWidget('file').control;
    class LinkedFileControl extends FileControl {
      constructor(props) {
        super(props);
        this.renderFileLink = value => h('a', { href: previewURL(value, this.props.getAsset, this.props.field), target: '_blank', rel: 'noopener noreferrer' }, String(value).split('/').pop());
      }
      componentDidUpdate(previous) {
        super.componentDidUpdate();
        if (previous.value !== this.props.value && this.props.value) {
          const asset = this.props.getAsset(this.props.value, this.props.field);
          if (asset?.fileObj && cleanPath(asset.path) === cleanPath(this.props.value)) {
            uploadDates.set(cleanPath(this.props.value), { url: String(asset) });
          }
        }
      }
    }
    CMS.registerWidget('file', LinkedFileControl, CMS.getWidget('file').preview);

    CMS.registerEventListener({ name: 'preSave', handler: ({ entry }) => {
      if (activeBatches) throw new Error('Please wait for the artwork uploads to finish before publishing.');
      let data = entry.get('data');
      if (entry.get('collection') === 'music') {
        const ids = new Set();
        return data.update('releases', releases => releases.map(item => {
          const id = item.get('id') || `release-${crypto.randomUUID()}`;
          if (ids.has(id)) throw new Error(`Duplicate release ID: ${id}`);
          ids.add(id);
          return item.set('id', id);
        }));
      }
      if (entry.get('collection') !== 'artwork') return data;
      return data.update('images', images => images.map(item => {
        const uploaded = uploadDates.get(cleanPath(item.get('src')));
        if (!item.get('title')) item = item.set('title', uploaded?.title || fileTitle(item.get('src')));
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
            item.src ? h('a', { href: previewURL(item.src), target: '_blank', rel: 'noopener noreferrer' }, h('img', { src: previewURL(item.src), loading: 'lazy', style: { width: '100%', height: 150, objectFit: 'contain' } })) : null,
            h('figcaption', {}, `${item.title || 'Untitled'} · ${item.date || 'Date from uploaded file'}`)))));
    });
    CMS.registerPreviewTemplate('commissions', ({ entry }) => h('main', { style: { padding: 24, fontFamily: 'system-ui' } },
      ...((entry.get('data').toJS().tiers) || []).map(tier => h('section', { key: tier.id, style: { marginBottom: 24 } },
        h('h2', {}, tier.title), h('strong', {}, tier.price), h('p', { style: { whiteSpace: 'pre-wrap' } }, tier.description),
        ...(tier.images || []).map((item, index) => h('img', { key: index, src: previewURL(item.src), alt: item.alt || '', style: { width: 100, height: 100, objectFit: 'contain' } }))))));
    CMS.registerPreviewTemplate('releases', ({ entry }) => h('main', { style: { padding: 24, fontFamily: 'system-ui' } },
      ...((entry.get('data').toJS().releases) || []).map((release, index) => h('section', { key: index, style: { marginBottom: 24 } },
        h('h2', {}, `${release.title || 'New release'} · ${release.year || ''}`),
        release.cover ? h('img', { src: previewURL(release.cover), style: { width: 160, height: 160, objectFit: 'contain' } }) : null,
        ...(release.tracks || []).map((track, i) => h('div', { key: i }, h('p', {}, track.title),
          track.preview_url ? h('audio', { controls: true, preload: 'none', src: previewURL(track.preview_url) }) : null))))));
    CMS.init({ config: { ...config, load_config_file: false } });
    startup.remove();
  } catch (error) {
    startup.textContent = error.message;
  }
})();
