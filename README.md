# PKG Art web

Preview and download **icon0.png**, **pic0.png**, and **pic1.png** from a PS4 PKG file, directly in your browser.

**[Open PKG Art](https://h5d7r.github.io/pkg-art-web/)**

## Features

- Load a local `.pkg` file or a direct download link.
- Preview the original artwork at full size.
- Download individual PNGs or all available images in one ZIP.
- Show the game title, title ID, version, and package size when available.
- Read only the required file sections for local packages and range-enabled hosts.
- Process local files on your device without uploading them.
- Use a responsive English interface with bundled fonts and no runtime dependencies.

## How to use

1. Choose **Local file** and select a PS4 `.pkg`, or choose **Direct link** and paste the actual file URL.
2. Press **Load package**.
3. Click an image to preview it, use its download button, or select **Download all images**.

Images absent from the package are marked **Not included**. Use **Clear source** to reset the tool or **Cancel** to stop a read.

## Run locally

Download the repository, extract it, and open **index.html** in your browser. Keep the `src` and `assets` folders alongside it. Local packages need no server, installation, or internet connection.

## Direct links

Use a direct HTTPS file URL, rather than a share page or a link requiring login. The host must allow browser access through CORS. Efficient remote reads also require byte-range support and an exposed `Content-Range` header.

If a host blocks browser access, download the PKG and use **Local file**. Hosts ignoring ranges are limited to a 32 MiB prefix; artwork outside that prefix cannot be loaded remotely.

## Compatibility

Supports PS4 PKG files containing readable PNG artwork. Some packages do not include all three images. PS3, PS5, encrypted artwork, DDS-only artwork, and split or incomplete packages are unsupported. Individual images are limited to 32 MiB and 40 million pixels.

The tool preserves the original PNG bytes and does not modify or install packages. Local files stay on the device; direct links contact their file host. The application has no uploads, account system, proxy, or analytics.

## Files

```text
index.html     Interface
style.css      Styles
src/           PKG reader, previews, and ZIP downloads
assets/        Icon, bundled fonts, and required font licenses
.nojekyll      Static GitHub Pages publishing
```

To publish your own copy, enable GitHub Pages from the root of the `main` branch. No build step is needed.
