const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

function readScript(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', '..', relPath), 'utf8');
}

async function bootScript({ html, scriptRelPath, windowMocks = {}, beforeEval }) {
  const dom = new JSDOM(html, {
    url: 'http://localhost/src/html/index.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });

  const { window } = dom;
  const { document } = window;
  const domReadyCallbacks = [];
  const originalAddEventListener = document.addEventListener.bind(document);

  document.addEventListener = (type, listener, options) => {
    if (type === 'DOMContentLoaded') {
      domReadyCallbacks.push(listener);
      return;
    }
    return originalAddEventListener(type, listener, options);
  };

  window.performance = window.performance || { now: () => Date.now() };
  window.confirm = window.confirm || (() => true);
  window.alert = window.alert || (() => {});
  window.prompt = window.prompt || (() => null);

  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';

  class MockFileReader {
    readAsText(file) {
      const result = file && (file.content || file.text || '');
      if (typeof this.onload === 'function') {
        this.onload({ target: { result } });
      }
    }
  }

  window.FileReader = MockFileReader;
  window.Chart = function ChartStub() {
    return { destroy() {} };
  };

  Object.assign(window, windowMocks);

  if (typeof beforeEval === 'function') {
    beforeEval(window, document);
  }

  window.eval(readScript(scriptRelPath));
  for (const cb of domReadyCallbacks) {
    cb.call(document, new window.Event('DOMContentLoaded', { bubbles: true }));
  }

  await tick();

  return {
    dom,
    window,
    document,
    cleanup() {
      dom.window.close();
    }
  };
}

function setFileInput(window, inputEl, fileName, content) {
  Object.defineProperty(inputEl, 'files', {
    configurable: true,
    value: [{ name: fileName, content }]
  });
  inputEl.dispatchEvent(new window.Event('change', { bubbles: true }));
}

async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

module.exports = {
  bootScript,
  setFileInput,
  tick
};
