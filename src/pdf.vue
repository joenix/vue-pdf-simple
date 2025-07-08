<style lang="less">
/* Vue PDF Simple */
.vps {
  --vps-space: 10px;
  --vps-color: white;
  --vps-background: rgba(0, 0, 0, 0.2);
  --vps-menus: rgba(255, 255, 255, 0.1);
  --vps-gap: 4px;
  --vps-size: 24px;
  --vps-effect: 0.32s;
  --vps-point: red;

  & {
    display: flex;
    flex-direction: column;
    box-sizing: content-box;
    overflow: auto;
  }

  &-tools {
    & {
      color: var(--vps-color);
      background: var(--vps-backgroun);
      padding: var(--vps-gap);
      justify-content: flex-end;
      gap: calc(var(--vps-gap) * 2);
    }

    &,
    &-page,
    &-zoom,
    &-prev,
    &-next,
    &-minus,
    &-plus,
    &-input {
      display: flex;
    }

    &,
    &-page,
    &-zoom {
      flex-direction: row;
    }

    &-page,
    &-zoom {
      gap: var(--vps-gap);
    }

    &-prev,
    &-next,
    &-minus,
    &-plus,
    &-input {
      height: var(--vps-size);
      border: 1px solid color-mix(in srgb, var(--vps-menus) 50%, black);
      background-color: var(--vps-menus);

      justify-content: center;
      align-items: center;

      border-radius: 4px;
    }

    &-prev,
    &-next,
    &-minus,
    &-plus {
      font-size: 16px;
      font-family: monospace;
      width: var(--vps-size);

      cursor: pointer;
      transition: all var(--vps-effect);

      &:hover,
      &:active {
        background-color: color-mix(in srgb, var(--vps-menus) 90%, white);
      }
    }

    &-input {
      width: calc(var(--vps-size) * 2);
    }

    &-prev,
    &-next {
      transform: rotate(90deg);
    }
  }

  &-container {
    flex: 1;
    overflow: auto;
  }

  &-wrapper {
  }

  &-target {
  }

  &-page {
    position: relative;
  }

  &-context {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
  }

  &-point {
    border: 1px solid var(--vps-point);
    border-radius: 2px;
    box-sizing: content-box;
    position: absolute;
  }

  canvas {
    width: 100%;
  }
}
</style>

<template>
  <div class="vps" :style="{ ...style }">
    <!-- Tools -->
    <div class="vps-tools">
      <!-- Page -->
      <div class="vps-tools-page">
        <div class="vps-tools-prev" @click="prev">«</div>
        <div class="vps-tools-input">{{ current }}</div>
        <div class="vps-tools-next" @click="next">»</div>
      </div>
      <!-- Zoom -->
      <div class="vps-tools-zoom">
        <div class="vps-tools-minus" @click="minus">-</div>
        <div class="vps-tools-input">{{ cssPercent(zoom) }}</div>
        <div class="vps-tools-plus" @click="plus">+</div>
      </div>
    </div>

    <!-- Container -->
    <div class="vps-container" ref="container">
      <div class="vps-wrapper" ref="wrapper">
        <div class="vps-target" ref="target">
          <vue-view-observer class="vps-page" v-for="{ key } in PDFs" :key="key" :data-key="key" container=".vps-container" :full="true" @subscribe="onSubscribe">
            <canvas class="vps-canvas" :ref="`pdf_${key}`" />
            <div class="vps-context" :ref="`lay_${key}`"></div>
          </vue-view-observer>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
// Use View Observer
import { vueViewObserver } from 'vue-view-observer';

// Use Pan Zoom
import Panzoom from '@panzoom/panzoom';

// Use PDFJS
import { getDocument, GlobalWorkerOptions, Util } from 'pdfjs-dist';

// Set Worker for Vite
import worker from 'pdfjs-dist/build/pdf.worker?url';
GlobalWorkerOptions.workerSrc = worker;

// As Component
export default {
  components: {
    vueViewObserver
  },

  props: {
    visible: {
      type: Boolean,
      default: false
    },

    src: {
      type: String,
      default: ''
    },

    width: {
      type: [Number, String],
      default: '100%'
    },

    height: {
      type: [Number, String],
      default: 'auto'
    },

    page: {
      type: Number,
      default: 1
    },

    scale: {
      type: Number,
      default: 100
    },

    context: {
      type: Array,
      default: []
    }
  },

  data() {
    return {
      PDFs: [],
      total: 0,
      current: 1,
      zoom: 100,

      // 缩放对象
      panzoom: null
    };
  },

  computed: {
    style() {
      const { width, height } = this;
      return {
        width: this.cssProperty(width),
        height: this.cssProperty(height)
      };
    },

    ratio() {
      return (this.zoom * (window.devicePixelRatio || 1)) / 100;
    }
  },

  watch: {
    visible: {
      handler(value) {
        if (value === false) {
          this.PDFs = [];
        }
      },
      immediate: true
    },

    src: {
      handler(value) {
        if (value) {
          this.render(value);
        }
      }
    },

    page: {
      handler(value) {
        this.current = value;
        this.scrolling(this.dom(value));
      }
    },

    scale: {
      handler(value) {
        this.zoom = value;
        this.render(this.src);
      }
    },

    context: {
      handler() {
        this.highlight();
      },
      deep: true
    }
  },

  methods: {
    cssProperty(prop) {
      return prop + (Number.isFinite(prop) ? 'px' : '');
    },

    cssPercent(num) {
      return `${num}%`;
    },

    ref(key) {
      const ref = this.$refs[key];
      return Array.isArray(ref) ? ref[0] : ref;
    },

    dom(key) {
      return document.querySelector(`.vps [data-key="${key}"]`);
    },

    calculate(space) {
      return this.ref('container').clientWidth / space;
    },

    setDiv(node, style, callback = () => {}) {
      // Check Node
      node = node || document.createElement('div');

      // Merge Style
      Object.assign(node.style, style);

      // Update in Callback
      return (node = callback(node) || node);
    },

    range(n) {
      return [...Array(n)].map((_, i) => -~i);
    },

    async sleep(count = 1, per = 60) {
      return new Promise((resolve) => {
        const out = setTimeout(() => {
          resolve(), clearTimeout(out);
        }, count * per);
      });
    },

    async load(url) {
      return await getDocument({ url, withCredentials: false }).promise;
    },

    async recursion(group, callback, result = []) {
      // Hass
      if (group.length) {
        // Update Result
        result.push(await callback(group.shift(), result.length));

        // Next
        return await this.recursion(group, callback, result);
      }

      // Endness
      return result;
    },

    async create(doc, key) {
      // Get Page
      const page = await doc.getPage(key);

      // Set Key
      page.key = key;

      // Update Page
      return page;
    },

    async compile(page, key) {
      // Set Viewport
      const viewport = page.getViewport({ scale: this.ratio });

      // Set Canvas
      const canvas = this.ref(`pdf_${key}`);
      const canvasContext = canvas.getContext('2d');

      // Set Size
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      // Page Render
      await page.render({ canvasContext, viewport });

      // Context Render
      await this.renderContext({ page, viewport });
    },

    async render(src) {
      // No Src
      if (!src) return;

      // Get Doc
      const doc = await this.load(src);

      // Set Total
      this.total = doc.numPages;

      // Make PDFs
      await this.recursion(this.range(this.total), async (key, index) => {
        // Update Page
        const page = await this.create(doc, key);

        // Set into PDFs
        this.PDFs[index] = page;

        // Await for Dom Render
        await this.sleep();

        // Compile
        await this.compile(page, key);

        // Update Page
        return page;
      });
    },

    async renderContext({ page, viewport }) {
      // Get Ratio by Calculate
      const ratio = this.calculate(viewport.width);

      // Get Context
      const { items } = await page.getTextContent();

      // Cache Items
      page.items = items;
      page.ratio = ratio;
      page.viewport = viewport;

      // Render Highlight
      this.highlight();
    },

    // highlight(context = []) {}
    highlight() {
      // PDFs
      for (const { key, items, ratio, viewport } of this.PDFs) {
        // Set Layer
        const layer = this.setDiv(
          this.ref(`lay_${key}`),

          {},

          // Clear First
          (node) => {
            node.innerHTML = '';
          }
        );

        // Clean Layer
        layer.querySelectorAll('.vps-point').forEach((node) => node.remove());

        // Loop Context
        for (const { page, text } of this.context.filter(({ page }) => page === key)) {
          // Find Items
          for (const { str, transform, width, height } of items) {
            // No Match
            if (!str.includes(text)) {
              continue;
            }

            // Get Transform
            const [a, b, c, d, x, y] = Util.transform(viewport.transform, transform);

            // Make Div
            const div = this.setDiv(
              undefined,

              {
                top: `${y * ratio - height}px`,
                left: `${x * ratio - 2}px`,

                width: `${width}px`,
                height: `${height}px`
              },

              (node) => {
                node.className = 'vps-point';
              }
            );

            // Insert Div into Layer
            layer.appendChild(div);
          }
        }
      }
    },

    /**
     * Tools
     * ======== ======== ========
     */

    onSubscribe(intersecting, { intersectionRatio, target }) {
      if (intersecting && intersectionRatio === 1) {
        this.current = target.dataset.key - 0;
      }
    },

    scrolling(dom, block = 'center', inline = 'center') {
      // Get Dom
      dom = dom instanceof HTMLElement ? dom : document.querySelector(dom);

      // Scroll To View
      if (dom) {
        dom.scrollIntoView({ behavior: 'smooth', block, inline });
      }
    },

    zooming() {
      // Get Wrapper
      const wrapper = this.ref('wrapper');

      // Get Target
      const target = this.ref('target');

      // Bind Panzoom
      this.panzoom = Panzoom(target, {
        minScale: 0.5,
        maxScale: 4.0,
        contain: 'outside',
        canvas: true
      });

      // Event Wheel
      wrapper.addEventListener(
        'wheel',
        (event) => {
          if (event.ctrlKey) {
            event.preventDefault();
            this.panzoom.zoomWithWheel(event);
            this.zoom = Math.round(this.panzoom.getScale() * 100);
          }
        },
        { passive: false }
      );
    },

    prev() {
      if (this.current > 1) {
        this.current--;
        this.scrolling(this.dom(this.current));
      }
    },

    next() {
      if (this.current < this.total) {
        this.current++;
        this.scrolling(this.dom(this.current));
      }
    },

    minus() {
      if (this.zoom <= 50) {
        return;
      }

      this.panzoom.zoomOut();
      this.zoom = Math.round(this.panzoom.getScale() * 100);
    },

    plus() {
      if (this.zoom >= 400) {
        return;
      }

      this.panzoom.zoomIn();
      this.zoom = Math.round(this.panzoom.getScale() * 100);
    }
  },

  // First
  async mounted() {
    this.$nextTick(() => {
      this.render(this.src);
      this.zooming();
    });
  }
};
</script>
