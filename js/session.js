/*
 * 練習セッション本体の A-Frame コンポーネント。
 *
 * やっていることは3つ。
 *   1. シナリオの時刻表どおりに聴衆を出し入れする
 *   2. 発表者がどこを見ているかを一定間隔で記録する
 *   3. 終わったら記録を 'session-end' イベントで外に投げる
 *
 * 視線はカメラに付けた raycaster で取っている。HMDのアイトラッキングではなく
 * 頭の向きなので、厳密には「顔を向けた先」であって視線ではない。
 * この区別はレポートの限界のところに書いてある。
 */
AFRAME.registerComponent('poster-session', {
  schema: {
    level: { type: 'int', default: 1 },
    speed: { type: 'number', default: 1 },   // 動作確認用の早送り
    sampleMs: { type: 'number', default: 100 }
  },

  init: function () {
    this.scn = window.PosterScenario;
    this.audienceRoot = document.querySelector('#audience');
    this.cameraEl = document.querySelector('[camera]');
    this.timerEl = document.querySelector('#hud-timer');
    this.noticeEl = document.querySelector('#hud-notice');

    this.running = false;
    this.elapsed = 0;
    this.sampleAcc = 0;
    this.pending = [];
    this.present = {};      // slot -> 到着記録（いま居る人）
    this.arrivals = [];     // 到着記録の全件（帰った人も残す）
    this.gaze = {};         // 対象id -> 見ていた秒数
    this.statements = [];   // xAPI風の記録
    this.noticeFlash = 0;

    this.buildAudienceSlots();
    this.el.sceneEl.addEventListener('session-start', this.start.bind(this));
  },

  // --- 聴衆のアバターを立ち位置ぶん作っておき、出入りは可視性で切り替える
  buildAudienceSlots: function () {
    var self = this;
    this.avatars = this.scn.SLOTS.map(function (slot, i) {
      var g = document.createElement('a-entity');
      g.setAttribute('position', slot.x + ' 0 ' + slot.z);
      g.setAttribute('rotation', '0 ' + slot.rot + ' 0');
      g.setAttribute('visible', false);

      // 身長はおよそ1.7m。発表者の目線(1.6m)が頭の高さに来るようにしてある。
      // ここを低くすると、水平に見ているつもりでも視線が頭上を素通りする
      var body = document.createElement('a-cylinder');
      body.setAttribute('radius', 0.21);
      body.setAttribute('height', 1.15);
      body.setAttribute('position', '0 0.575 0');
      body.setAttribute('material', 'color: #46506b; roughness: 0.9');
      g.appendChild(body);

      var head = document.createElement('a-sphere');
      head.setAttribute('radius', 0.16);
      head.setAttribute('position', '0 1.42 0');
      head.setAttribute('material', 'color: #c8a888; roughness: 0.85');
      g.appendChild(head);

      // 視線の当たり判定。頭より大きめ（肩から頭上まで）に取っている。
      // 「その人を見た」と言える範囲は顔よりやや広い
      var hit = document.createElement('a-box');
      hit.setAttribute('width', 0.54); hit.setAttribute('height', 0.82); hit.setAttribute('depth', 0.54);
      hit.setAttribute('position', '0 1.35 0');
      hit.setAttribute('material', 'opacity: 0; transparent: true');
      hit.setAttribute('class', 'gaze-target');
      hit.dataset.targetId = 'listener-' + i;
      hit.dataset.targetLabel = '聴衆' + (i + 1);
      g.appendChild(hit);

      // 到着直後だけ足元が光る。気づきのきっかけであり、
      // 現実にはこんな手がかりは無いので、レポートでは「学習用の足場」として扱う
      var ring = document.createElement('a-ring');
      ring.setAttribute('radius-inner', 0.3);
      ring.setAttribute('radius-outer', 0.42);
      ring.setAttribute('rotation', '-90 0 0');
      ring.setAttribute('position', '0 0.02 0');
      ring.setAttribute('material', 'color: #ffc46b; opacity: 0.85; transparent: true; side: double');
      ring.setAttribute('visible', false);
      g.appendChild(ring);

      self.audienceRoot.appendChild(g);
      return { el: g, ring: ring, slot: slot };
    });
  },

  start: function () {
    var lv = this.scn.LEVELS[this.data.level] || this.scn.LEVELS[1];
    this.level = lv;
    this.duration = lv.duration;
    this.pending = lv.events.slice().sort(function (a, b) { return a.t - b.t; });
    this.elapsed = 0;
    this.gaze = {};
    this.statements = [];
    this.present = {};
    this.arrivals = [];
    this.avatars.forEach(function (a) {
      a.el.setAttribute('visible', false);
      a.ring.setAttribute('visible', false);
    });
    this.running = true;
  },

  tick: function (time, dt) {
    if (!this.running) { return; }
    var step = (dt / 1000) * this.data.speed;
    this.elapsed += step;

    this.runEvents();
    this.sampleAcc += dt;
    if (this.sampleAcc >= this.data.sampleMs) {
      this.sampleGaze(this.sampleAcc / 1000 * this.data.speed);
      this.sampleAcc = 0;
    }
    this.updateHud(step);

    if (this.elapsed >= this.duration) { this.finish(); }
  },

  runEvents: function () {
    while (this.pending.length && this.pending[0].t <= this.elapsed) {
      var ev = this.pending.shift();
      var av = this.avatars[ev.slot];
      if (ev.type === 'arrive') {
        av.el.setAttribute('visible', true);
        av.ring.setAttribute('visible', true);
        var rec = {
          id: 'listener-' + ev.slot,
          label: '聴衆' + (ev.slot + 1),
          arrivedAt: this.elapsed,
          noticedAt: null
        };
        this.arrivals.push(rec);
        this.present[ev.slot] = rec;
        this.noticeFlash = 2.5;
        this.flash('聴衆' + (ev.slot + 1) + ' が加わりました');
        this.log('arrived', 'listener-' + ev.slot, '聴衆' + (ev.slot + 1), null);
      } else {
        av.el.setAttribute('visible', false);
        av.ring.setAttribute('visible', false);
        delete this.present[ev.slot];
        this.flash('聴衆' + (ev.slot + 1) + ' が離れました');
        this.log('departed', 'listener-' + ev.slot, '聴衆' + (ev.slot + 1), null);
      }
    }
  },

  // three.js のレイは visible=false のメッシュにも当たる。
  // そのままだと「帰った人をずっと見ていた」ことになってしまうので、
  // 親まで遡って実際に表示されているものだけを採用する。
  isShown: function (el) {
    var o = el.object3D;
    while (o) {
      if (o.visible === false) { return false; }
      o = o.parent;
    }
    return true;
  },

  sampleGaze: function (sec) {
    var rc = this.cameraEl.components.raycaster;
    if (!rc) { return; }
    var els = rc.intersectedEls || [];
    var hit = null;
    for (var i = 0; i < els.length; i++) {
      if (this.isShown(els[i])) { hit = els[i]; break; }
    }
    var id = hit ? hit.dataset.targetId : 'nowhere';
    this.gaze[id] = (this.gaze[id] || 0) + sec;

    if (!hit) { return; }
    // 到着してから初めてその人を見るまでの時間を測る
    for (var slot in this.present) {
      var p = this.present[slot];
      if (p.id === id && p.noticedAt === null) {
        p.noticedAt = this.elapsed;
        this.log('noticed', p.id, p.label, this.elapsed - p.arrivedAt);
        this.avatars[slot].ring.setAttribute('visible', false);
      }
    }
  },

  updateHud: function (step) {
    var left = Math.max(0, Math.ceil(this.duration - this.elapsed));
    var m = Math.floor(left / 60), s = left % 60;
    this.timerEl.setAttribute('jp-label', 'value',
      '残り ' + m + ':' + (s < 10 ? '0' : '') + s + '   聴衆 ' + Object.keys(this.present).length + '人');
    if (this.noticeFlash > 0) {
      this.noticeFlash -= step;
      if (this.noticeFlash <= 0) { this.noticeEl.setAttribute('jp-label', 'value', ''); }
    }
  },

  flash: function (msg) { this.noticeEl.setAttribute('jp-label', 'value', msg); },

  // xAPI の形に寄せた記録。LRSには送っていない（レポートの未実装部分）
  log: function (verb, objId, objLabel, durationSec) {
    var st = {
      actor: { account: { homePage: 'local', name: 'learner' } },
      verb: { id: 'local/verb/' + verb, display: { 'ja-JP': verb } },
      object: { id: 'xr-poster-practice/' + objId, definition: { name: { 'ja-JP': objLabel } } },
      timestamp: new Date().toISOString(),
      context: { extensions: { 'local/elapsed': Math.round(this.elapsed * 10) / 10 } }
    };
    if (durationSec !== null && durationSec !== undefined) {
      st.result = { duration: 'PT' + (Math.round(durationSec * 10) / 10) + 'S' };
    }
    this.statements.push(st);
  },

  finish: function () {
    this.running = false;
    // 到着した人は、途中で帰っていても全員ぶん集計する。
    // 気づかれないまま帰った人を落とすと、いちばん見たい失敗が消えてしまう。
    var notices = this.arrivals.map(function (a) {
      return {
        label: a.label,
        latency: a.noticedAt === null ? null : Math.round((a.noticedAt - a.arrivedAt) * 10) / 10
      };
    });

    this.el.sceneEl.emit('session-end', {
      level: this.data.level,
      levelLabel: this.level.label,
      duration: this.duration,
      gaze: this.gaze,
      notices: notices,
      statements: this.statements
    });
    this.timerEl.setAttribute('jp-label', 'value', '終了');
    this.noticeEl.setAttribute('jp-label', 'value', '');
  }
});
