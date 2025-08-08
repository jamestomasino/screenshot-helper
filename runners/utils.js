export async function ensureAssetsLoaded(page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    const imgs = Array.from(document.images);
    await Promise.all(imgs.map(img => {
      if (img.complete) return;
      return new Promise(res => { img.onload = img.onerror = res; });
    }));
    if ('fonts' in document) await document.fonts.ready;
  });
}

export async function scroll(page) {
  return await page.evaluate(async () => {
    return await new Promise((resolve) => {
      var i = setInterval(() => {
        window.scrollBy(0, window.innerHeight);
        if (document.scrollingElement.scrollTop + window.innerHeight >= document.scrollingElement.scrollHeight) {
          clearInterval(i);
          resolve();
        }
      }, 100);
    });
  });
}
