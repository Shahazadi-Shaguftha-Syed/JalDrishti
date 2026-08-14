import React from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useWideLayout } from '@/components/AppShell';
import { BarChart3, Droplets, Info } from '@/components/Icons';
import StateBarChart, { StateRow } from '@/components/StateBarChart';
import {
  Badge,
  Card,
  Empty,
  ErrorState,
  GlassCard,
  Loading,
  PulseBadge,
  SectionTitle,
} from '@/components/Ui';
import { API_BASE, useApi } from '@/constants/api';
import tw from '@/constants/tailwind';

export default function StatesScreen() {
  const wide = useWideLayout();
  const { data, error, loading, reload } = useApi<StateRow[]>('/states/');
  const rows = (data ?? []).filter((r) => r.stations > 0);

  if (loading && !data) return <Loading label="Evaluating state groundwater benchmarks…" />;
  if (error && !data)
    return (
      <SafeAreaView style={tw`flex-1 bg-slate-50 justify-center`}>
        <ErrorState message={error} onRetry={reload} />
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={tw`flex-1 bg-slate-50/50`} edges={wide ? [] : ['top']}>
      <ScrollView
        contentContainerStyle={tw`${wide ? 'px-8 pt-6' : 'px-4 pt-4'} pb-32`}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}>
        {/* Mobile Header */}
        {!wide && (
          <View style={tw`pt-1 pb-1`}>
            <Text style={tw`text-[10px] font-semibold text-sky-600 uppercase tracking-widest`}>
              VULNERABILITY INDEX
            </Text>
            <View style={tw`flex-row items-center justify-between mt-0.5`}>
              <Text style={tw`text-xl font-bold text-slate-900 tracking-tight`}>
                State Comparison &amp; Benchmarks
              </Text>
              <PulseBadge label={`${rows.length} States`} />
            </View>
            <Text style={tw`text-xs text-slate-500 mt-1 font-normal`}>
              Water-table dynamics &amp; vulnerability ranking across Indian states
            </Text>
          </View>
        )}

        {/* State Benchmark — metric-switchable bar chart */}
        <SectionTitle
          title="State Benchmark"
          subtitle="Switch metric to re-rank every state against the national peak"
          icon={BarChart3}
          action={<Badge label={`${rows.length} states`} variant="secondary" />}
        />
        <Card style={tw`p-4`}>
          {rows.length ? (
            <StateBarChart rows={rows} />
          ) : (
            <Empty label="No state data currently loaded" />
          )}
        </Card>

        {/* Hackathon & Technical Documentation */}
        <SectionTitle
          title="About JalDrishti (SIH25068)"
          subtitle="Ministry of Jal Shakti • Smart India Hackathon 2024"
          icon={Info}
        />
        <GlassCard>
          <View style={tw`flex-row items-center mb-3`}>
            <View style={tw`w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-400/30 items-center justify-center mr-2.5`}>
              <Droplets size={19} color="#38bdf8" strokeWidth={2} />
            </View>
            <View>
              <Text style={tw`text-sm font-semibold text-white`}>
                Automated Groundwater Intelligence Engine
              </Text>
              <Text style={tw`text-xs text-sky-300 font-medium`}>
                Ministry of Jal Shakti • Central Ground Water Board (CGWB)
              </Text>
            </View>
          </View>

          <Text style={tw`text-xs text-slate-300 leading-5 mb-4 font-normal`}>
            JalDrishti continuously assimilates 6-hourly telemetric Digital Water Level Recorder (DWLR) feeds across India, evaluating recharge dynamics via the GEC-2015 Water Table Fluctuation methodology and isolating sensor anomalies to provide decision support for artificial recharge structures.
          </Text>

          {[
            ['Data Pipeline', 'India-WRIS Automated Telemetry Gateway'],
            ['Recharge Estimation', 'Water Table Fluctuation (WTF) • GEC-2015 Standard'],
            ['Predictive Modeling', '90-Day Linear + Monsoon Harmonic Fit'],
            ['Backend API URL', API_BASE],
          ].map(([k, v]) => (
            <View key={k} style={tw`flex-row justify-between py-2 border-t border-slate-800`}>
              <Text style={tw`text-xs text-slate-400 font-normal`}>{k}</Text>
              <Text style={tw`text-xs font-medium text-slate-200 text-right ml-4`}>{v}</Text>
            </View>
          ))}
        </GlassCard>
      </ScrollView>
    </SafeAreaView>
  );
}
