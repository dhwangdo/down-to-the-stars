import styles from "./page.module.css";

const ENEMIES = [
  { name: "주황 슬라임", hp: 28, note: "점액 충돌 · 점액 방어" },
  { name: "골렘", hp: 52, note: "... · ...! · 공격" },
  { name: "하수구 쥐", hp: 32, note: "물어뜯기 · 웅크리기 · 광폭 질주" },
  { name: "도깨비", hp: 48, note: "난타 · 연타 · 강습" },
];

export default function ContentLab() {
  return (
    <main className={styles.lab}>
      <header className={styles.header}>
        <small>RUINFALL CONTENT LAB</small>
        <h1>적 · 카드 작업실</h1>
        <p>다음 콘텐츠 추가 작업은 이 탭에서 진행합니다. 현재 게임 데이터는 변경하지 않았습니다.</p>
      </header>

      <section className={styles.section} aria-labelledby="enemy-heading">
        <div className={styles.sectionHeading}>
          <div><small>ENEMIES</small><h2 id="enemy-heading">현재 적</h2></div>
          <strong>{ENEMIES.length}종</strong>
        </div>
        <div className={styles.enemyList}>
          {ENEMIES.map((enemy) => (
            <article key={enemy.name}><h3>{enemy.name}</h3><span>HP {enemy.hp}</span><p>{enemy.note}</p></article>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="new-content-heading">
        <div className={styles.sectionHeading}>
          <div><small>NEW CONTENT</small><h2 id="new-content-heading">추가 대기</h2></div>
          <strong>준비됨</strong>
        </div>
        <div className={styles.queue}>
          <article><h3>새 적</h3><p>이름, 체력, 행동 순서, 특성, 보상 규칙을 정하면 다음 단계에서 추가합니다.</p></article>
          <article><h3>새 카드</h3><p>이름, 비용, 희귀도, 효과와 수치를 정하면 다음 단계에서 추가합니다.</p></article>
        </div>
      </section>
    </main>
  );
}
