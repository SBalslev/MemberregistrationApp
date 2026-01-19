import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { writeFileSync } from 'fs';

// Create a simple icon with "M" on blue background
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="32" fill="#1e40af"/>
  <text x="128" y="175" font-family="Arial, sans-serif" font-size="160" font-weight="bold" fill="white" text-anchor="middle">M</text>
</svg>`;

async function generateIcon() {
  // Generate PNG at 256x256
  const pngBuffer = await sharp(Buffer.from(svg))
    .resize(256, 256)
    .png()
    .toBuffer();
  
  // Save PNG for reference
  writeFileSync('public/icon.png', pngBuffer);
  console.log('Created: public/icon.png');
  
  // Convert to ICO
  const icoBuffer = await pngToIco(pngBuffer);
  writeFileSync('public/icon.ico', icoBuffer);
  console.log('Created: public/icon.ico');
}

generateIcon().catch(console.error);
