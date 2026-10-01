/*
 * セッション終了後の集計・提示と、次回難度の決定。
 *
 * 第10回の資料にあった「取得したデータを元に提示を変える」の最小版。
 * 記録はブラウザの localStorage に置いているだけで、LRSには送っていない。
 */
window.PosterFeedback = (function () {
  var KEY = 'xr-poster-practice/history';
  var scn = window.PosterScenario;

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch (e) { return []; }   // プライベートウィンドウ等では読めないことがある
  }

  function saveHistory(h) {
    try { localStorage.setItem(KEY, JSON.stringify(h.slice(-10))); }
    catch (e) { /* 保存できなくても練習自体は続けられるので握りつぶす */ }
  }

  function analyze(d) {
    var gaze = d.gaze || {};
    var total = 0, listenerTotal = 0, posterTotal = 0, maxOne = 0;
    var perListener = {};
    var panelsUsed = [];

    Object.keys(gaze).forEach(function (id) {
      var sec = gaze[id];
      total += sec;
      if (id.indexOf('listener-') === 0) {
        listenerTotal += sec;
        perListener[id] = sec;
        if (sec > maxOne) { maxOne = sec; }
      } else if (id.indexOf('panel-') === 0) {
        posterTotal += sec;
        if (sec >= 2) { panelsUsed.push(id); }
      }
    });

    var latencies = d.notices.filter(function (n) { return n.latency !== null; })
                             .map(function (n) { return n.latency; });
    var missed = d.notices.filter(function (n) { return n.latency === null; });
    // 同じ人が一度帰ってまた来ることがある（難度3のシナリオ）。
    // そのたびに見逃すと名前が二度並んでしまうので、人単位にまとめる
    var missedLabels = [];
    missed.forEach(function (n) {
      if (missedLabels.indexOf(n.label) < 0) { missedLabels.push(n.label); }
    });

    return {
      at: new Date().toISOString(),
      level: d.level,
      levelLabel: d.levelLabel,
      duration: d.duration,
      avgNotice: latencies.length
        ? Math.round(latencies.reduce(function (a, b) { return a + b; }, 0) / latencies.length * 10) / 10
        : null,
      missedCount: missedLabels.length,
      missedLabels: missedLabels,
      arrivalCount: d.notices.length,
      maxShare: total ? maxOne / total : 0,
      posterShare: total ? posterTotal / total : 0,
      listenerShare: total ? listenerTotal / total : 0,
      perListener: perListener,
      panelsUsed: panelsUsed,
      panelsUnused: scn.PANELS.filter(function (p) {
        return panelsUsed.indexOf(p.id) < 0;
      }).map(function (p) { return p.label; }),
      total: total
    };
  }

  function pct(x) { return Math.round(x * 100) + '%'; }

  function judge(ok) { return ok ? '<span class="ok">目安内</span>' : '<span class="ng">要改善</span>'; }

  function render(a) {
    var T = scn.TARGET;
    var noticeOk = a.avgNotice !== null && a.avgNotice <= T.noticeSec && a.missedCount === 0;
    var rows = [
      ['新しく来た人に気づくまで',
       a.avgNotice === null ? '一度も目を向けていません' : '平均 ' + a.avgNotice + ' 秒',
       '目安 ' + T.noticeSec + ' 秒以内', noticeOk],
      ['最も長く見た一人の割合', pct(a.maxShare), '目安 ' + pct(T.maxShare) + ' 以下',
       a.maxShare <= T.maxShare],
      ['ポスターを見ていた割合', pct(a.posterShare), '目安 ' + pct(T.posterShare) + ' 以下',
       a.posterShare <= T.posterShare]
    ];

    var html = '<h2>練習の記録（難度' + a.level + '：' + a.levelLabel + '）</h2><table>';
    rows.forEach(function (r) {
      html += '<tr><th>' + r[0] + '</th><td>' + r[1] + '</td><td class="t">' + r[2] + '</td><td>' + judge(r[3]) + '</td></tr>';
    });
    html += '</table>';

    if (a.missedCount) {
      html += '<p class="warn">途中から来た ' + a.missedLabels.join('・') +
              ' に一度も目を向けていません。ポスター発表では、来た人に気づいて話を戻せるかがいちばん効きます。</p>';
    }
    if (a.panelsUnused.length) {
      html += '<p>発表中に使わなかったパネル：' + a.panelsUnused.join('・') + '</p>';
    }
    if (a.total < 5) {
      html += '<p class="warn">記録された時間が短すぎます。開始してから最後まで実施してください。</p>';
    }
    return html;
  }

  function init(sceneEl, onNext) {
    var panel = document.getElementById('result');
    var body = document.getElementById('result-body');
    var nextMsg = document.getElementById('next-level');
    var summary = document.querySelector('#result-3d');

    sceneEl.addEventListener('session-end', function (e) {
      var a = analyze(e.detail);
      var history = loadHistory();
      history.push(a);
      saveHistory(history);

      body.innerHTML = render(a);
      var next = scn.pickLevel(history);
      nextMsg.textContent = next.reason;
      panel.hidden = false;

      // HMD装着中はDOMのパネルが見えないので、要点だけシーン内にも出す。
      // 逆にPCでは下のDOMパネルと二重になるだけなので、VRのときしか出さない
      summary.setAttribute('jp-label', 'value',
        '練習おわり\n気づくまで ' + (a.avgNotice === null ? '— ' : a.avgNotice + ' 秒') +
        '  未対応 ' + a.missedCount + '人\n一人への偏り ' + pct(a.maxShare) +
        '  ポスター ' + pct(a.posterShare));
      summary.setAttribute('visible', sceneEl.is('vr-mode'));

      window.__lastResult = a;              // 動作確認用
      window.__lastStatements = e.detail.statements;
      if (onNext) { onNext(next); }
    });

    // 結果を出したあとで装着／外した場合にも追従させる
    sceneEl.addEventListener('enter-vr', function () {
      if (!panel.hidden) { summary.setAttribute('visible', true); }
    });
    sceneEl.addEventListener('exit-vr', function () {
      summary.setAttribute('visible', false);
    });
  }

  return { init: init, loadHistory: loadHistory, analyze: analyze };
})();
