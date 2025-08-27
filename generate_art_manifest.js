// Scans assets/art/*.{jpg,jpeg,png,webp,avif,gif} and writes assets/data/images.json
// Run: node generate_art_manifest.js
const fs = require('fs');
const path = require('path');

const IN_DIR = path.join(process.cwd(), 'assets', 'art');
const OUT_DIR = path.join(process.cwd(), 'assets', 'data');
const OUT_FILE = path.join(OUT_DIR, 'images.json');
const exts = new Set(['.jpg','.jpeg','.png','.webp','.avif','.gif']);

function walkTopLevel(dir){
	return fs.readdirSync(dir, { withFileTypes: true })
		.filter(d => d.isFile() && exts.has(path.extname(d.name).toLowerCase()))
		.map(d => path.join(dir, d.name));
}

function rel(p){
	return p.replace(process.cwd()+path.sep, '').replace(/\\/g,'/');
}

(function build(){
	if (!fs.existsSync(IN_DIR)) {
		console.error('No assets/art directory found.');
		process.exit(1);
	}
	if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

	const files = walkTopLevel(IN_DIR);
	const images = files.map(f => ({ src: rel(f), title: toTitle(path.basename(f)) }))
		.sort((a, b) => a.src.localeCompare(b.src));

	const json = { images };
	fs.writeFileSync(OUT_FILE, JSON.stringify(json, null, '\t'));
	console.log(`Wrote ${rel(OUT_FILE)} with ${images.length} images`);
})();

function toTitle(name){
	return name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
}
