import Link from "next/link";

export default function ReportsMethodologyPage() {
  return (
    <div className="rh-container rh-container--narrow">
      <Link className="rh-back-link" href="/reports">
        ← 报告中心
      </Link>

      <header className="rh-page-header">
        <h1 className="rh-page-title">穿透收益率与前置筛选说明</h1>
        <p className="rh-page-desc">
          这页用人话解释为什么会出现“前置筛选结束（非异常）”，以及关键公式和阈值口径。
        </p>
      </header>

      <article className="report-entry-body rh-prose">
        <h2>1. 先看结论</h2>
        <ul>
          <li>若“穿透收益率”低于最低门槛，系统会提前停止后续因子。</li>
          <li>这叫“前置筛选结束”，不是程序报错。</li>
          <li>筛选结束后未执行到的风险项会显示为“暂未评估（前置筛选结束）”。</li>
        </ul>

        <h2>2. 核心公式</h2>
        <ul>
          <li>
            穿透收益率：<code>R = I / MarketCap</code>
          </li>
          <li>
            门槛值：<code>II = max(3.5%, rf + 2%)</code>
          </li>
        </ul>

        <h2>3. 前置筛选结束触发条件（因子2-S4）</h2>
        <ul>
          <li>
            <code>R &lt; rf</code>，或
          </li>
          <li>
            <code>R &lt; II * 0.5</code>
          </li>
        </ul>

        <h2>4. 变量说明</h2>
        <ul>
          <li>
            <code>I</code>：穿透收益近似值（由净利润、少数股东损益、OCF 与 Capex 调整得到）
          </li>
          <li>
            <code>MarketCap</code>：当前市值
          </li>
          <li>
            <code>rf</code>：无风险利率（默认口径 2.5%，可由数据源覆盖）
          </li>
          <li>
            <code>II</code>：策略最低回报门槛
          </li>
        </ul>

        <h2>5. 常见误解</h2>
        <ul>
          <li>“暂未评估（前置筛选结束）”不等于“低风险”。它表示流程没有走到该步骤。</li>
          <li>“前置筛选结束”不等于“任务失败”。任务可能是成功执行后按规则停止。</li>
        </ul>
      </article>
    </div>
  );
}

