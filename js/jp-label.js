/*
 * 日本語のラベルを3D空間に出すための A-Frame コンポーネント。
 *
 * A-Frame 標準の <a-text> は MSDF 方式で、同梱フォント（Roboto）に
 * 日本語のグリフが入っていない。そのため日本語を入れると何も描画されず、
 * 試作を日本語UIで作るとHUDもポスターの見出しも全部消える。
 *
 * 日本語対応の MSDF アトラスを用意する手もあるが、フォントファイルの配布と
 * ビルド工程が増える。ここでは canvas にブラウザの既定フォントで文字を描き、
 * それをテクスチャとして板に貼っている。追加の配布物が要らず、
 * 閲覧者の環境のフォントがそのまま使われる。
 *
 * 引き換えに、文字は板のテクスチャなので遠くでは <a-text> より粗い。
 * 読ませたいのは短いラベルだけなので、この試作では問題にならない。
 */
AFRAME.registerComponent('jp-label', {
  schema: {
    value:  { type: 'string', default: '' },     // \n で改行
    color:  { type: 'color',  default: '#ffffff' },
    size:   { type: 'number', default: 0.16 },   // 1行の高さ（メートル）
    weight: { type: 'string', default: '600' },
    bg:     { type: 'string', default: '' }      // 空なら背景なし
  },

  // canvas 側の実寸。ここを大きくすると綺麗になるがテクスチャも重くなる
  FONT_PX: 72,
  LINE_PX: 96,
  PAD_PX: 18,

  init: function () {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.draw();
  },

  update: function () { this.draw(); },

  font: function () {
    return this.data.weight + ' ' + this.FONT_PX +
      'px "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif';
  },

  draw: function () {
    var d = this.data;
    // 中身が変わっていなければ描き直さない（HUDは毎フレーム呼ばれる）
    var sig = [d.value, d.color, d.size, d.weight, d.bg].join('|');
    if (sig === this.sig) { return; }
    this.sig = sig;

    if (!d.value) { this.el.removeObject3D('jp-label'); return; }

    // HTML属性で書いた場合、改行は \n の2文字として渡ってくる
    var lines = String(d.value).replace(/\\n/g, '\n').split('\n');
    var ctx = this.ctx;
    ctx.font = this.font();
    var textW = 1;
    lines.forEach(function (l) { textW = Math.max(textW, ctx.measureText(l).width); });

    this.canvas.width = Math.ceil(textW) + this.PAD_PX * 2;
    this.canvas.height = lines.length * this.LINE_PX + this.PAD_PX * 2;

    // canvas のサイズを変えると状態が消えるので、ここで font を入れ直す
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (d.bg) {
      ctx.fillStyle = d.bg;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    ctx.font = this.font();
    ctx.fillStyle = d.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var self = this;
    lines.forEach(function (l, i) {
      ctx.fillText(l, self.canvas.width / 2, self.PAD_PX + self.LINE_PX * (i + 0.5));
    });

    var mPerPx = d.size / this.LINE_PX;
    var mesh = this.el.getObject3D('jp-label');
    if (!mesh) {
      var tex = new THREE.CanvasTexture(this.canvas);
      tex.anisotropy = 4;
      mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
      );
      this.el.setObject3D('jp-label', mesh);
    }
    mesh.material.map.needsUpdate = true;
    mesh.scale.set(this.canvas.width * mPerPx, this.canvas.height * mPerPx, 1);
  },

  remove: function () { this.el.removeObject3D('jp-label'); }
});
