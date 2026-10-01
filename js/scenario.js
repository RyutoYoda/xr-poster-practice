/*
 * 練習シナリオの定義。
 *
 * ポスター発表の難しさは「話す内容」ではなく「場の制御」にあるので、
 * 聴衆が時間差で来て、途中で抜ける、という出入りそのものをシナリオにしている。
 * 難度は聴衆の入れ替わりの激しさで表す。
 */
window.PosterScenario = (function () {

  // 聴衆の立ち位置。発表者は原点に立ち、既定で -Z を向いている。
  // ポスターは左手（-X側）の壁にあるので、聴衆を見るには正面、
  // ポスターを指すには左を向く必要がある。この首の振りが練習対象。
  var SLOTS = [
    { x: -0.70, z: -2.30, rot:  15 },
    { x:  0.45, z: -2.45, rot:  -8 },
    { x:  1.55, z: -2.05, rot: -32 },
    { x: -1.50, z: -2.60, rot:  28 },
    { x:  2.25, z: -1.35, rot: -58 },
    { x:  0.05, z: -3.25, rot:   0 }
  ];

  // ポスターの面。発表中にどこを使ったかを見るために分割してある。
  // y はワールド座標の高さ。紙は 0.50〜2.00 にあり、1.80 から上は見出し用に空けている。
  var PANELS = [
    { id: 'panel-bg',     label: '背景',   y: 1.64 },
    { id: 'panel-method', label: '手法',   y: 1.33 },
    { id: 'panel-exp',    label: '実験',   y: 1.02 },
    { id: 'panel-concl',  label: 'まとめ', y: 0.71 }
  ];

  var LEVELS = {
    1: {
      label: '基本',
      note: '聴衆の入れ替わりは少なめ。まず正面と左（ポスター）の往復に慣れる。',
      duration: 120,
      events: [
        { t:   0, type: 'arrive', slot: 0 },
        { t:   0, type: 'arrive', slot: 1 },
        { t:  35, type: 'arrive', slot: 2 },
        { t:  70, type: 'leave',  slot: 0 },
        { t:  85, type: 'arrive', slot: 3 }
      ]
    },
    2: {
      label: '標準',
      note: '発表の途中で人が入れ替わる。来た人に気づけるかを見る。',
      duration: 150,
      events: [
        { t:   0, type: 'arrive', slot: 1 },
        { t:  18, type: 'arrive', slot: 0 },
        { t:  45, type: 'arrive', slot: 4 },
        { t:  62, type: 'leave',  slot: 1 },
        { t:  80, type: 'arrive', slot: 2 },
        { t: 100, type: 'leave',  slot: 0 },
        { t: 112, type: 'arrive', slot: 3 },
        { t: 130, type: 'arrive', slot: 5 }
      ]
    },
    3: {
      label: '本番相当',
      note: '常に誰かが出入りする。全員に目を配りながら話し直す必要がある。',
      duration: 180,
      events: [
        { t:   0, type: 'arrive', slot: 1 },
        { t:  12, type: 'arrive', slot: 3 },
        { t:  28, type: 'arrive', slot: 4 },
        { t:  40, type: 'leave',  slot: 1 },
        { t:  48, type: 'arrive', slot: 0 },
        { t:  66, type: 'arrive', slot: 5 },
        { t:  82, type: 'leave',  slot: 3 },
        { t:  95, type: 'arrive', slot: 2 },
        { t: 110, type: 'leave',  slot: 4 },
        { t: 124, type: 'arrive', slot: 1 },
        { t: 142, type: 'arrive', slot: 3 },
        { t: 160, type: 'leave',  slot: 0 }
      ]
    }
  };

  // 評価の目安。レポートの「どこまで実装したか」に対応する。
  var TARGET = {
    noticeSec: 10,     // 新しく来た人に気づくまで
    maxShare: 0.40,    // 特定の一人に向けた視線の割合の上限
    posterShare: 0.35  // ポスターを見ていた時間の割合の上限
  };

  /*
   * 前回までの結果から今回の難度を決める。
   * 第10回の資料にあった「その人のデータを元に提示を変える」の最小版で、
   * できている観点を外し、できていない観点だけを厳しくする方針にしている。
   */
  function pickLevel(history) {
    if (!history || !history.length) {
      return { level: 1, reason: '初回なので基本から始めます。' };
    }
    var last = history[history.length - 1];
    var ok = 0;
    var missed = [];
    // 気づかれないまま帰った人が一人でも居たら、平均が速くてもここは未達とする。
    // 平均だけ見ると「一人を完全に無視した」が消えてしまい、
    // いちばん直すべき失敗のまま難度が上がってしまう
    if (last.avgNotice !== null && last.avgNotice <= TARGET.noticeSec && !last.missedCount) { ok++; }
    else if (last.missedCount) { missed.push('最後まで気づかれなかった人がいる'); }
    else { missed.push('新しく来た人への反応'); }
    if (last.maxShare <= TARGET.maxShare) { ok++; }
    else { missed.push('視線の配り方'); }
    if (last.posterShare <= TARGET.posterShare) { ok++; }
    else { missed.push('ポスターの見すぎ'); }

    var level = Math.min(3, 1 + ok);
    var reason = missed.length
      ? '前回は「' + missed.join('」「') + '」が目安に届きませんでした。難度' + level + 'で続けます。'
      : '前回はすべて目安に届きました。難度' + level + 'に上げます。';
    return { level: level, reason: reason };
  }

  return {
    SLOTS: SLOTS, PANELS: PANELS, LEVELS: LEVELS, TARGET: TARGET,
    pickLevel: pickLevel
  };
})();
