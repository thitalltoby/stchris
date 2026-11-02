TT Firs Neue (TypeType) is a licensed typeface and is not included in this project.

To switch the headings to it, add the licensed web-font files here, named exactly:

  TTFirsNeue-Regular.woff2    (400)
  TTFirsNeue-Medium.woff2     (500)
  TTFirsNeue-DemiBold.woff2   (600)
  TTFirsNeue-Bold.woff2       (700)
  TTFirsNeue-ExtraBold.woff2  (800)

Headings and buttons use 700 and 800. Any file that is missing is skipped. No code change is needed;
rebuild/restart and the site uses it automatically. Until then headings fall back to Figtree.
Convert .otf/.ttf to .woff2 with:  pyftsubset Font.otf --flavor=woff2 --unicodes="*" --output-file=TTFirsNeue-Bold.woff2
