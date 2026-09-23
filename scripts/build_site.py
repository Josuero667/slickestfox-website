"""Build the public website without changing the editable source data."""
import colorsys
from datetime import date as calendar_date
import hashlib
import html as html_lib
import json
from pathlib import Path
import re
import shutil
import stat
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ART = 'assets/art/data/images.json'


def read_json(root, name):
    return json.loads((root / name).read_text(encoding='utf-8-sig'))


def write_json(root, name, data):
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def local_asset(root, source):
    if not isinstance(source, str) or not source.startswith(('assets/', '/assets/')):
        raise ValueError(f'Artwork must use a local asset: {source}')
    candidate = (root / source.lstrip('/')).resolve()
    if not candidate.is_relative_to((root / 'assets').resolve()) or not candidate.is_file():
        raise ValueError(f'Artwork file is missing or outside assets: {source}')
    return candidate


def hue(item):
    value = item.get('color', '#808080').lstrip('#')
    if len(value) == 3:
        value = ''.join(c * 2 for c in value)
    return colorsys.rgb_to_hsv(*(int(value[i:i+2], 16) / 255 for i in (0, 2, 4)))[0]


def render_commissions(root, output):
    root, output = root.resolve(), output.resolve()
    data_path = root / 'assets/data/commissions.json'
    if not data_path.exists():
        return
    page = output / 'commissions.html'
    html = page.read_text(encoding='utf-8')
    seen = set()
    for tier in read_json(root, 'assets/data/commissions.json')['tiers']:
        key = tier['id']
        if key in seen or not re.fullmatch(r'[a-z]+', key):
            raise ValueError('Invalid or duplicate commission tier')
        seen.add(key)
        description = html_lib.escape(tier['description'])
        description = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', description)
        pictures = []
        for item in tier['images']:
            asset = local_asset(root, item['src'])
            target = output / asset.relative_to(root)
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                shutil.copy2(asset, target)
            cls = ' class="static-gallery-img"' if key == 'emotes' else ''
            pictures.append(f'<img src="{html_lib.escape(item["src"].lstrip("/"), quote=True)}" alt="{html_lib.escape(item.get("alt", tier["title"]), quote=True)}"{cls}>')
        # Duplicate the track automatically for the existing seamless animation.
        values = {'title': html_lib.escape(tier['title']), 'price': html_lib.escape(tier['price']),
                  'description': description.replace('\n', '<br>'),
                  'images': '\n'.join(pictures if key == 'emotes' else pictures * 2)}
        for field, value in values.items():
            pattern = rf'(<!-- cms:{key}:{field} -->).*?(<!-- /cms:{key}:{field} -->)'
            html, count = re.subn(pattern, lambda m: m[1] + value + m[2], html, flags=re.S)
            if count != 1:
                raise ValueError(f'Missing commission template slot: {key}:{field}')
    expected = set(re.findall(r'<!-- cms:([a-z]+):title -->', html))
    if seen != expected:
        raise ValueError('Commission tiers must match the page layout')
    page.write_text(html, encoding='utf-8')


def prepare_art(root, output, settings):
    manifest = read_json(root, ART)
    images = []
    for original in manifest['images']:
        if original.get('published') is False:
            continue
        item = dict(original)
        path = local_asset(root, item['src'])
        date = item.get('date', '')
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date):
            raise ValueError(f'Missing saved file date for {item.get("title", path.name)}')
        calendar_date.fromisoformat(date)
        # Never infer from build-machine mtime: Git resets it during checkout.
        item['year'] = date[:4]
        digest = hashlib.sha256(path.read_bytes()).hexdigest()[:20]
        preview = f'assets/art/generated/{digest}-preview.webp'
        display = f'assets/art/generated/{digest}-display.webp'
        target = output / preview
        target.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(path) as source:
            animated = getattr(source, 'is_animated', False)
            image = ImageOps.exif_transpose(source).convert('RGBA')
            if not item.get('color'):
                sample = image.copy()
                sample.thumbnail((64, 64))
                pixels = [p[:3] for p in sample.get_flattened_data() if p[3] >= 128]
                rgb = tuple(round(sum(p[c] for p in pixels) / len(pixels)) for c in range(3)) if pixels else (128, 128, 128)
                item['color'] = '#%02x%02x%02x' % rgb
            if not re.fullmatch(r'#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?', item['color']):
                raise ValueError(f'Invalid color for {item.get("title", path.name)}')
            thumb = image.copy()
            thumb.thumbnail((600, 600), Image.Resampling.LANCZOS)
            thumb.save(target, 'WEBP', quality=80)
            if animated:
                # Keep animation in the large view; thumbnails use the first frame.
                display = f'assets/art/generated/{digest}{path.suffix.lower()}'
                shutil.copy2(path, output / display)
            else:
                image.thumbnail((2400, 2400), Image.Resampling.LANCZOS)
                image.save(output / display, 'WEBP', quality=90)
        item.update(src=display, preview=preview)
        images.append(item)
    sort = settings.get('gallery_sort', 'manual')
    if sort == 'color':
        images.sort(key=hue)
    elif sort == 'date':
        images.sort(key=lambda item: item['date'], reverse=True)
    elif sort != 'manual':
        raise ValueError(f'Unknown gallery sort: {sort}')
    write_json(output, ART, {'images': images})


def build(root=ROOT, output=None):
    root = root.resolve()
    output = (output or root / '_site').resolve()
    # Only our dedicated generated directory may be replaced.
    if output != root / '_site' or not output.is_relative_to(root):
        raise ValueError('Build output must be the project _site directory')
    if output.exists():
        def remove_readonly(function, path, error):
            # Windows copytree can preserve the source folders' read-only flag.
            # Only repair permissions inside the verified generated directory.
            target = Path(path).resolve()
            if not isinstance(error, PermissionError) or not target.is_relative_to(output):
                raise error
            target.chmod(stat.S_IWRITE | stat.S_IREAD | stat.S_IEXEC)
            function(path)
        shutil.rmtree(output, onexc=remove_readonly)
    output.mkdir()
    for name in ('index.html', 'art.html', 'commissions.html', 'dog-posting.html',
                 'music.html', 'videos.html', 'sylviumlighting.html', 'style.css',
                 'art.js', 'music.js', 'videos.js', 'settings.js', 'admin.html', 'CNAME'):
        if (root / name).exists():
            shutil.copy2(root / name, output / name)
    shutil.copytree(root / 'admin', output / 'admin')
    # Originals stay in Git. Only display copies are published for gallery art.
    def ignore_assets(directory, names):
        if Path(directory) == root / 'assets' / 'art':
            return [n for n in names if n in ('main', 'additional', 'uploads', 'generated')]
        return [n for n in names if n.endswith('.aseprite')]
    shutil.copytree(root / 'assets', output / 'assets', ignore=ignore_assets)
    render_commissions(root, output)
    # Commission examples are referenced directly, outside the gallery manifest.
    for page in output.glob('*.html'):
        for source in re.findall(r'''(?:src|href)=["'](/?assets/art/(?:main|additional|uploads)/[^"']+)["']''', page.read_text(encoding='utf-8-sig')):
            asset = local_asset(root, source)
            target = output / asset.relative_to(root)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(asset, target)
    settings = read_json(root, 'assets/data/settings.json')
    if type(settings.get('commissions_open')) is not bool:
        raise ValueError('commissions_open must be true or false')
    prepare_art(root, output, settings)
    posts = read_json(root, 'assets/data/posts.json')
    posts['posts'] = [p for p in posts['posts'] if p.get('published') is not False]
    write_json(output, 'assets/data/posts.json', posts)
    commissions = output / 'commissions.html'
    html = commissions.read_text(encoding='utf-8')
    if settings['commissions_open']:
        html = html.replace('class="comm-status closed" data-commission-status>COMMISSIONS CLOSED',
                            'class="comm-status open" data-commission-status>COMMISSIONS OPEN')
    commissions.write_text(html, encoding='utf-8')
    (output / '.nojekyll').touch()
    print(f'Built website in {output}')


if __name__ == '__main__':
    build()
