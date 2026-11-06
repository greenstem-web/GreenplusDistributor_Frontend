import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const HEIGHT = 320; // plot + x-axis band, so the card never needs its own scrollbar
const PAD = { top: 12, right: 8, bottom: 34, left: 58 };
const MAX_BAR = 16; // a bar is never wider than this, however few days there are

/** 0, 1, 2, 2.5, 5 x 10^n - tick steps people read without effort. */
function niceStep(max, count) {
  if (max <= 0) return 1;
  const raw = max / count;
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const unit = raw / power;
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10;
  return nice * power;
}

/**
 * A bar from the zero line to `y`, with the 4px rounding on its data end only - the end at zero
 * stays square, so every bar reads as anchored to the baseline.
 */
function barPath(x, w, y0, y) {
  const h = Math.abs(y - y0);
  const r = Math.min(4, w / 2, h);
  if (h < 0.5) return "";
  if (y < y0) {
    // above zero: round the top
    return `M${x},${y0} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y0} Z`;
  }
  // below zero: round the bottom
  return `M${x},${y0} V${y - r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y - r} V${y0} Z`;
}

/**
 * Net sales per day (or per month on long ranges), one bar each.
 *
 * Plain SVG rather than a chart widget, so every mark follows the page's spec. The plot is washed
 * green above zero and red below it, so a day where credit notes beat sales is plain at a glance -
 * and its bar is red too, with the legend saying so in words. Hovering (or the arrow keys) snaps to
 * the nearest day and shows both figures; the table view carries every value without hovering.
 */
export default function TrendChart({ points, bucket, formatAmount, formatQuantity, formatDate }) {
  const wrap = useRef(null);
  const [width, setWidth] = useState(600);
  const [active, setActive] = useState(null);

  // Follow the card's width, so the chart fills it on any screen without a horizontal scroll.
  useEffect(() => {
    const node = wrap.current;
    if (!node) return undefined;
    const observer = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0].contentRect.width);
      if (w > 0) setWidth(w);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const hasNegative = points.some((p) => p.amount < 0);

  const geometry = useMemo(() => {
    const plotW = Math.max(1, width - PAD.left - PAD.right);
    const plotH = HEIGHT - PAD.top - PAD.bottom;
    const values = points.map((p) => p.amount);
    const maxValue = Math.max(0, ...values);
    const minValue = Math.min(0, ...values); // credit notes can take a day below zero

    const step = niceStep(Math.max(maxValue - minValue, 1), 5);
    const top = Math.max(step, Math.ceil(maxValue / step) * step);
    const bottom = Math.floor(minValue / step) * step;

    // One slot per point; the bar sits in the middle of its slot.
    const slot = plotW / Math.max(points.length, 1);
    const barW = Math.max(2, Math.min(MAX_BAR, slot * 0.6));
    const x = (i) => PAD.left + slot * (i + 0.5);
    const y = (v) => PAD.top + ((top - v) / (top - bottom || 1)) * plotH;

    const ticks = [];
    for (let v = bottom; v <= top + step / 2; v += step) ticks.push(v);

    // At most ~7 date labels - fewer on a narrow chart, about one per 64px - always with the last point.
    const maxLabels = Math.max(2, Math.min(7, Math.floor(plotW / 64)));
    const every = Math.max(1, Math.ceil(points.length / maxLabels));
    const labelIdx = points.map((_, i) => i).filter((i) => i % every === 0 || i === points.length - 1);
    const dedup = labelIdx.filter((i, k) => k === labelIdx.length - 1 || labelIdx[k + 1] - i >= every / 2);

    return { plotW, plotH, slot, barW, x, y, ticks, labelIdx: dedup };
  }, [points, width]);

  const pick = useCallback(
    (clientX) => {
      const node = wrap.current;
      if (!node || points.length === 0) return;
      const left = node.getBoundingClientRect().left;
      const i = Math.floor((clientX - left - PAD.left) / geometry.slot);
      setActive(Math.min(points.length - 1, Math.max(0, i)));
    },
    [geometry.slot, points.length]
  );

  const onKeyDown = (e) => {
    if (points.length === 0) return;
    if (e.key === "ArrowRight") setActive((i) => Math.min(points.length - 1, (i ?? -1) + 1));
    else if (e.key === "ArrowLeft") setActive((i) => Math.max(0, (i ?? points.length) - 1));
    else if (e.key === "Escape") setActive(null);
    else return;
    e.preventDefault();
  };

  const { x, y, barW, plotW, plotH, slot } = geometry;
  const zero = y(0);
  const point = active != null ? points[active] : null;
  const tipLeft = point ? x(active) : 0;
  const tipOnLeft = tipLeft > width * 0.6;

  return (
    <div className="trend">
      <div className="trend-legend" aria-hidden="true">
        <span className="trend-legend-item">
          <span className="trend-swatch trend-swatch-up" /> Net sales
        </span>
        {hasNegative && (
          <span className="trend-legend-item">
            <span className="trend-swatch trend-swatch-down" /> Below zero (credit notes exceed sales)
          </span>
        )}
      </div>

      <div className="trend-plot" ref={wrap}>
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`Net sales per ${bucket}. Use the left and right arrow keys to read each ${bucket}.`}
          tabIndex={0}
          onPointerMove={(e) => pick(e.clientX)}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive((i) => i ?? points.length - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={onKeyDown}
        >
          {/* The two zones: sales above the zero line, credit notes winning below it. */}
          <rect className="trend-zone-up" x={PAD.left} y={PAD.top} width={plotW} height={Math.max(0, zero - PAD.top)} />
          <rect className="trend-zone-down" x={PAD.left} y={zero} width={plotW} height={Math.max(0, PAD.top + plotH - zero)} />

          {geometry.ticks.map((v) => (
            <g key={v}>
              {v !== 0 && <line className="trend-grid" x1={PAD.left} x2={PAD.left + plotW} y1={y(v)} y2={y(v)} />}
              <text className="trend-tick" x={PAD.left - 10} y={y(v)} dy="0.32em" textAnchor="end">
                {formatAmount(v, true)}
              </text>
            </g>
          ))}

          <line className="trend-axis" x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + plotH} />

          {geometry.labelIdx.map((i) => (
            // A label too close to the right edge to centre on its bar ends at the bar instead.
            <text key={i} className="trend-tick" x={x(i)} y={HEIGHT - 10} textAnchor={x(i) + 24 > width ? "end" : "middle"}>
              {formatDate(points[i].date, bucket, true)}
            </text>
          ))}

          {/* The hovered day's slot, behind its bar. */}
          {point && <rect className="trend-hover" x={x(active) - slot / 2} y={PAD.top} width={slot} height={plotH} />}

          {points.map((p, i) => {
            const d = barPath(x(i) - barW / 2, barW, zero, y(p.amount));
            if (!d) return null;
            const cls = p.amount < 0 ? "trend-bar trend-bar-down" : "trend-bar trend-bar-up";
            return <path key={p.date} d={d} className={cls + (i === active ? " trend-bar-on" : "")} />;
          })}

          <line className="trend-baseline" x1={PAD.left} x2={PAD.left + plotW} y1={zero} y2={zero} />
        </svg>

        {point && (
          <div
            className="trend-tip"
            style={{ left: tipLeft, transform: tipOnLeft ? "translateX(calc(-100% - 14px))" : "translateX(14px)" }}
            role="status"
          >
            <div className="trend-tip-date">{formatDate(point.date, bucket, false)}</div>
            <div className="trend-tip-row">
              <span className={point.amount < 0 ? "trend-swatch trend-swatch-down" : "trend-swatch trend-swatch-up"} aria-hidden="true" />
              <strong>{formatAmount(point.amount)}</strong>
              <span className="trend-tip-label">net sales</span>
            </div>
            <div className="trend-tip-row">
              <span className="trend-swatch trend-swatch-none" aria-hidden="true" />
              <strong>{formatQuantity(point.quantity)}</strong>
              <span className="trend-tip-label">quantity</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
