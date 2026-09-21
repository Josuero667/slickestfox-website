import json
import os
from pathlib import Path
import tempfile
import unittest
from PIL import Image
from scripts.build_site import prepare_art, local_asset, build


class ArtworkBuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.out = self.root / '_site'
        self.out.mkdir()
        (self.root / 'assets/art/data').mkdir(parents=True)

    def picture(self, name, color):
        path = self.root / 'assets/art' / name
        path.parent.mkdir(parents=True, exist_ok=True)
        Image.new('RGB', (1000, 800), color).save(path)
        return {'src': path.relative_to(self.root).as_posix(), 'title': name, 'date': '2024-06-01'}

    def prepare(self, items, sort='manual'):
        path = self.root / 'assets/art/data/images.json'
        original = json.dumps({'images': items})
        path.write_text(original)
        prepare_art(self.root, self.out, {'gallery_sort': sort})
        self.assertEqual(path.read_text(), original)
        return json.loads((self.out / 'assets/art/data/images.json').read_text())['images']

    def test_saved_date_survives_checkout_and_previews_are_small(self):
        item = self.picture('main/red.png', 'red')
        os.utime(self.root / item['src'], (1800000000, 1800000000))
        result = self.prepare([item])[0]
        self.assertEqual(result['year'], '2024')
        self.assertEqual(result['color'], '#ff0000')
        with Image.open(self.out / result['preview']) as image:
            self.assertLessEqual(max(image.size), 600)

    def test_same_basename_is_distinct_and_color_override_is_preserved(self):
        a = self.picture('main/art.png', 'red')
        b = self.picture('uploads/art.png', 'blue')
        b['color'] = '#123456'
        result = self.prepare([a, b])
        self.assertNotEqual(result[0]['preview'], result[1]['preview'])
        self.assertEqual(result[1]['color'], '#123456')

    def test_hidden_art_is_not_published_and_date_order_is_respected(self):
        a = self.picture('main/a.png', 'red')
        b = self.picture('main/b.png', 'blue')
        b['date'] = '2026-02-02'
        hidden = {'src': 'missing.png', 'published': False}
        result = self.prepare([a, hidden, b], 'date')
        self.assertEqual([x['title'] for x in result], ['main/b.png', 'main/a.png'])

    def test_hue_sort(self):
        blue = self.picture('main/blue.png', 'blue')
        red = self.picture('main/red.png', 'red')
        self.assertEqual(self.prepare([blue, red], 'color')[0]['title'], 'main/red.png')

    def test_external_or_escaped_paths_are_rejected(self):
        for source in ('https://example.com/image.png', 'assets/../../outside.png', '/etc/passwd'):
            with self.assertRaises(ValueError):
                local_asset(self.root, source)

    def test_missing_date_is_not_replaced_by_build_time(self):
        item = self.picture('main/red.png', 'red')
        del item['date']
        with self.assertRaisesRegex(ValueError, 'Missing saved file date'):
            self.prepare([item])

    def test_animated_original_is_preserved(self):
        path = self.root / 'assets/art/animated.gif'
        Image.new('RGB', (20, 20), 'red').save(path, save_all=True,
            append_images=[Image.new('RGB', (20, 20), 'blue')], duration=100, loop=0)
        result = self.prepare([{'src': 'assets/art/animated.gif', 'date': '2025-01-01'}])[0]
        with Image.open(self.out / result['src']) as image:
            self.assertTrue(image.is_animated)

    def test_output_guard(self):
        with self.assertRaises(ValueError):
            build(self.root, self.root / 'assets')

    def test_direct_commission_images_survive_build(self):
        item = self.picture('additional/example.gif', 'red')
        (self.root / 'admin').mkdir()
        (self.root / 'assets/data').mkdir()
        (self.root / 'assets/data/settings.json').write_text('{"commissions_open": false}')
        (self.root / 'assets/data/posts.json').write_text('{"posts": []}')
        (self.root / 'assets/art/data/images.json').write_text('{"images": []}')
        (self.root / 'commissions.html').write_text(f'<img src="{item["src"]}">')
        build(self.root)
        self.assertEqual((self.out / item['src']).read_bytes(), (self.root / item['src']).read_bytes())


if __name__ == '__main__':
    unittest.main()
