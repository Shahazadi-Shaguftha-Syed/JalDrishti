import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';

import { ArrowDown, ArrowUp } from '@/components/Icons';
import { Separator, Tabs } from '@/components/Ui';
import { fmt } from '@/constants/api';
import tw from '@/constants/tailwind';

export interface StateRow {
  state: string;
  stations: number;
  avg_trend: number | null;
  avg_level: number | null;
  avg_recharge: number | null;
  at_risk: number;
}

type MetricKey = 'trend' | 'level' | 'recharge' | 'risk';
type ChartKind = 'bar' | 'line';

interface Metric {
  key: MetricKey;
  label: string;
  unit: string;
  digits: number;
  /** Bars for unsigned metrics; below-zero bars when signed. */
  color: string;
  /** Above-zero bars when signed. */
  upColor?: string;
  /** Signed metrics grow both ways from a zero baseline. */
  signed?: boolean;
  caption: string;
  value: (r: StateRow) => number | null;
  /** Ranking key when it differs from the plotted value. Sorted worst-first. */
  rank?: (r: StateRow) => number | null;
}

const METRICS: Metric[] = [
  {
    key: 'trend',
    label: 'Trend',
    unit: 'm/yr',
    digits: 2,
    color: '#e11d48',
    upColor: '#10b981',
    signed: true,
    caption: 'Water-table change. Bars below the zero line are falling, above are rising.',
    // The API reports a depletion rate: +ve means the table is getting deeper.
    // Negate it so a bar points the way the water table actually moves — down
    // for falling, up for rising — instead of the arithmetic sign.
    value: (r) => (r.avg_trend === null ? null : -r.avg_trend),
    // Ranking still runs worst-depleting first, independent of bar direction.
    rank: (r) => r.avg_trend,
  },
  {
    key: 'level',
    label: 'Level',
    unit: 'm bgl',
    digits: 2,
    color: '#0284c7',
    caption: 'Mean depth to the water table. Taller bars sit deeper below ground.',
    value: (r) => r.avg_level,
  },
  {
    key: 'recharge',
    label: 'Recharge',
    unit: 'mm',
    digits: 0,
    color: '#6366f1',
    caption: 'Monsoon recharge by the GEC-2015 Water Table Fluctuation method.',
    value: (r) => r.avg_recharge,
  },
  {
    key: 'risk',
    label: 'At risk',
    unit: '%',
    digits: 0,
    color: '#f97316',
    caption: 'Share of each state’s recorders categorised critical or over-exploited.',
    value: (r) => (r.stations > 0 ? (r.at_risk / r.stations) * 100 : null),
  },
];

const PLOT_H = 210;
const AXIS_W = 46;
// Deep enough for a full state name set at 45°: "Andaman and Nicobar Islands"
// is the longest in the dataset.
const LABEL_H = 104;
const BAR_SLOT = 38;
const BAR_GAP = 12;
// Headroom for the topmost tick label, which would otherwise be clipped by the
// top edge of the SVG viewport.
const PAD_TOP = 10;

/** Axis ticks on round numbers, so the gridlines read as 0.2 / 0.4 not 0.183. */
function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const err = raw / mag;
  const step = mag * (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1);
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

export default function StateBarChart({ rows }: { rows: StateRow[] }) {
  const [metricKey, setMetricKey] = useState<MetricKey>('trend');
  const [kind, setKind] = useState<ChartKind>('bar');
  const [selected, setSelected] = useState<string | null>(null);
  const [boxWidth, setBoxWidth] = useState(0);

  const metric = METRICS.find((m) => m.key === metricKey) ?? METRICS[0];

  const bars = useMemo(() => {
    const rankOf = metric.rank ?? metric.value;
    const mapped = rows.map((r) => ({ row: r, v: metric.value(r), k: rankOf(r) }));
    // Nulls sort last rather than reading as zero, which would rank a state with
    // no usable figure alongside a genuinely stable one.
    return mapped.sort((a, b) => {
      if (a.k === null) return 1;
      if (b.k === null) return -1;
      return b.k - a.k;
    });
  }, [rows, metric]);

  const values = bars.map((b) => b.v).filter((v): v is number => v !== null);
  const rawMax = values.length ? Math.max(...values) : 1;
  const rawMin = values.length ? Math.min(...values) : 0;
  const maxAbs = Math.max(...values.map(Math.abs), 0.001);
  // Always include zero so bar heights stay proportional to the values.
  const ticks = niceTicks(Math.min(rawMin, 0), Math.max(rawMax, 0));
  const domainMin = ticks[0];
  const domainMax = ticks[ticks.length - 1];
  const span = domainMax - domainMin || 1;

  const y = (v: number) => PLOT_H - ((v - domainMin) / span) * (PLOT_H - PAD_TOP);
  const zeroY = y(0);

  const plotWidth = Math.max(boxWidth - AXIS_W, bars.length * BAR_SLOT);
  const slot = bars.length ? plotWidth / bars.length : plotWidth;
  const chosen = bars.find((b) => b.row.state === selected) ?? null;

  const colorFor = (v: number | null) =>
    v === null ? '#94a3b8' : metric.signed && v > 0 ? metric.upColor! : metric.color;


  return (
    <View onLayout={(e) => setBoxWidth(e.nativeEvent.layout.width)}>
      <Tabs
        value={metricKey}
        onChange={(k) => {
          setMetricKey(k);
          setSelected(null);
        }}
        items={METRICS.map((m) => ({ value: m.key, label: m.label }))}
      />

      {/* Caption or tapped-state readout, plus the chart-type switch */}
      <View style={tw`flex-row items-start justify-between mt-3 mb-2`}>
        <View style={tw`flex-1 pr-3`}>
          {chosen ? (
            <>
              <Text style={tw`text-xs font-semibold text-slate-900 tracking-tight`}>
                {chosen.row.state}
              </Text>
              <View style={tw`flex-row items-center flex-wrap`}>
                <Text style={tw`text-[10px] text-slate-500 font-normal`}>
                  {chosen.row.stations} recorders · {chosen.row.at_risk} at risk ·{' '}
                </Text>
                <Text
                  style={[tw`text-[11px] font-bold tabular-nums`, { color: colorFor(chosen.v) }]}>
                  {chosen.v === null
                    ? '—'
                    : metric.signed
                      ? // Magnitude plus direction in words, matching TrendBadge
                        // elsewhere — a bare "-1.10 falling" is a double negative.
                        `${Math.abs(chosen.v).toFixed(metric.digits)} ${metric.unit} ${
                          chosen.v < 0 ? 'falling' : 'rising'
                        }`
                      : `${chosen.v.toFixed(metric.digits)} ${metric.unit}`}
                </Text>
              </View>
            </>
          ) : (
            <Text style={tw`text-[10px] text-slate-400 font-normal`}>
              {kind === 'bar'
                ? metric.caption
                : `Ranked worst-first. Bar length is ${metric.label.toLowerCase()} relative to the national peak.`}
            </Text>
          )}
        </View>
        <View style={tw`w-28`}>
          <Tabs
            value={kind}
            onChange={setKind}
            items={[
              { value: 'bar' as ChartKind, label: 'Bar' },
              { value: 'line' as ChartKind, label: 'Line' },
            ]}
          />
        </View>
      </View>

      {kind === 'line' && (
        <View>
          {bars.map((b, i) => {
            const trend = b.row.avg_trend ?? 0;
            const declining = trend > 0;
            const atRiskPct = Math.round((b.row.at_risk / Math.max(b.row.stations, 1)) * 100);
            // Bar length tracks the selected metric so the tabs keep meaning
            // here, while the pill and sub-metrics stay fixed to the trend.
            const pct = b.v === null ? 0 : Math.min((Math.abs(b.v) / maxAbs) * 100, 100);

            return (
              <View key={b.row.state} style={tw`py-3 border-b border-slate-100`}>
                <View style={tw`flex-row items-center justify-between`}>
                  <View style={tw`flex-row items-center flex-1 pr-2`}>
                    <View
                      style={[
                        tw`w-6 h-6 rounded-lg items-center justify-center mr-2.5`,
                        i < 3 ? tw`bg-slate-900` : tw`bg-slate-100`,
                      ]}>
                      <Text
                        style={[
                          tw`text-xs font-semibold`,
                          i < 3 ? tw`text-white` : tw`text-slate-600`,
                        ]}>
                        {i + 1}
                      </Text>
                    </View>
                    <Text style={tw`text-sm font-semibold text-slate-900`} numberOfLines={1}>
                      {b.row.state}
                    </Text>
                  </View>

                  {b.row.avg_trend === null ? (
                    <Text style={tw`text-xs text-slate-400 font-normal`}>no trend</Text>
                  ) : (
                    <View
                      style={[
                        tw`flex-row items-center rounded-lg px-2 py-0.5 border`,
                        declining
                          ? tw`bg-rose-50 border-rose-200/70`
                          : tw`bg-emerald-50 border-emerald-200/70`,
                      ]}>
                      {declining ? (
                        <ArrowDown size={11} color="#dc2626" strokeWidth={2.5} />
                      ) : (
                        <ArrowUp size={11} color="#16a34a" strokeWidth={2.5} />
                      )}
                      <Text
                        style={[
                          tw`text-xs font-semibold ml-1`,
                          declining ? tw`text-rose-700` : tw`text-emerald-700`,
                        ]}>
                        {Math.abs(trend).toFixed(2)} m/yr {declining ? 'fall' : 'rise'}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={tw`flex-row items-center mt-2 ml-8.5`}>
                  <View style={tw`flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden mr-3`}>
                    <View
                      style={[
                        tw`h-1.5 rounded-full`,
                        { width: `${pct}%`, backgroundColor: colorFor(b.v) },
                      ]}
                    />
                  </View>
                  <Text style={tw`text-[11px] font-medium text-slate-500`}>
                    {b.row.stations} stations •{' '}
                    <Text
                      style={tw`font-semibold ${
                        b.row.at_risk > 0 ? 'text-sky-700' : 'text-slate-600'
                      }`}>
                      {b.row.at_risk} at risk ({atRiskPct}%)
                    </Text>
                  </Text>
                </View>

                <View style={tw`flex-row items-center mt-1.5 ml-8.5`}>
                  <Text style={tw`text-[10px] text-slate-400 mr-3 font-normal`}>
                    Mean Level:{' '}
                    <Text style={tw`text-slate-600 font-medium`}>
                      {fmt(b.row.avg_level, 2, ' m bgl')}
                    </Text>
                  </Text>
                  <Text style={tw`text-[10px] text-slate-400 font-normal`}>
                    Avg Recharge:{' '}
                    <Text style={tw`text-slate-600 font-medium`}>
                      {fmt(b.row.avg_recharge, 0, ' mm')}
                    </Text>
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {kind === 'bar' && boxWidth > 0 && (
        <View style={tw`flex-row`}>
          {/* Fixed value axis — stays put while the plot scrolls */}
          <Svg width={AXIS_W} height={PLOT_H + LABEL_H}>
            {ticks.map((t) => (
              <SvgText
                key={t}
                x={AXIS_W - 6}
                y={y(t) + 3}
                fontSize={9}
                fill="#94a3b8"
                textAnchor="end">
                {t.toFixed(metric.digits === 0 ? 0 : 1)}
              </SvgText>
            ))}
            <SvgText x={AXIS_W - 6} y={PLOT_H + 18} fontSize={8} fill="#cbd5e1" textAnchor="end">
              {metric.unit}
            </SvgText>
          </Svg>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}>
            <Svg width={plotWidth} height={PLOT_H + LABEL_H}>
              {ticks.map((t) => (
                <Line
                  key={t}
                  x1={0}
                  x2={plotWidth}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="#e2e8f0"
                  strokeWidth={1}
                  strokeDasharray={t === 0 ? undefined : '3 4'}
                />
              ))}
              {/* Zero baseline drawn solid on top of the dashed grid */}
              <Line x1={0} x2={plotWidth} y1={zeroY} y2={zeroY} stroke="#94a3b8" strokeWidth={1} />


              {bars.map((b, i) => {
                const bw = Math.max(Math.min(slot - BAR_GAP, 44), 6);
                const x = i * slot + (slot - bw) / 2;
                const top = b.v === null ? zeroY : Math.min(y(b.v), zeroY);
                const h = b.v === null ? 0 : Math.max(Math.abs(y(b.v) - zeroY), 1.5);
                const fill = colorFor(b.v);
                const active = selected === null || selected === b.row.state;

                return (
                  <G
                    key={b.row.state}
                    onPress={() =>
                      setSelected((cur) => (cur === b.row.state ? null : b.row.state))
                    }>
                    {/* Full-height hit target: a 3px bar is impossible to tap */}
                    <Rect
                      x={i * slot}
                      y={0}
                      width={slot}
                      height={PLOT_H + LABEL_H}
                      fill="transparent"
                    />

                    {b.v === null ? (
                      // Keep the state on the axis rather than dropping it: a
                      // missing column would read as "not in the dataset".
                      <Rect x={x} y={zeroY - 1} width={bw} height={2} fill="#cbd5e1" />
                    ) : (
                      <Rect
                        x={x}
                        y={top}
                        width={bw}
                        height={h}
                        rx={3}
                        fill={fill}
                        opacity={active ? 1 : 0.28}
                      />
                    )}

                    {/* Set at 45°: a full state name cannot fit horizontally
                        under a column this narrow. */}
                    <SvgText
                      x={i * slot + slot / 2}
                      y={PLOT_H + 14}
                      fontSize={9}
                      fontWeight={selected === b.row.state ? '700' : '400'}
                      fill={selected === b.row.state ? '#0f172a' : '#64748b'}
                      textAnchor="end"
                      transform={`rotate(-45, ${i * slot + slot / 2}, ${PLOT_H + 14})`}>
                      {b.row.state}
                    </SvgText>
                  </G>
                );
              })}
            </Svg>
          </ScrollView>
        </View>
      )}

      <Separator style={tw`mt-2 mb-2.5`} />

      <View style={tw`flex-row items-center flex-wrap`}>
        {(metric.signed
          ? [
              { c: metric.color, l: 'Falling' },
              { c: metric.upColor!, l: 'Rising' },
            ]
          : [{ c: metric.color, l: `${metric.label} (${metric.unit})` }]
        ).map((item) => (
          <View key={item.l} style={tw`flex-row items-center mr-4`}>
            <View
              style={[
                tw`mr-1.5 w-2 h-2 rounded-sm`,
                { backgroundColor: item.c },
              ]}
            />
            <Text style={tw`text-[10px] text-slate-500 font-normal`}>{item.l}</Text>
          </View>
        ))}
        <Text style={tw`text-[10px] text-slate-400 font-normal ml-auto`}>
          {kind === 'line'
            ? `${bars.length} states`
            : selected
              ? 'tap again to compare all'
              : 'tap a bar for detail'}
        </Text>
      </View>
    </View>
  );
}
