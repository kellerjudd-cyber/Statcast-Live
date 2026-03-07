import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Pitch } from '../types';

interface StrikeZoneProps {
  pitches: Pitch[];
  selectedPitchId?: string | null;
}

const StrikeZone: React.FC<StrikeZoneProps> = ({ pitches, selectedPitchId }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = 300;
    const height = 400;
    const margin = { top: 40, right: 40, bottom: 40, left: 40 };

    // Strike zone coordinates (approximate in feet)
    // x: -0.708 to 0.708 (17 inches wide)
    // y: 1.5 to 3.5 (approximate knee to chest)
    const szLeft = -0.708;
    const szRight = 0.708;
    const szBottom = 1.5;
    const szTop = 3.5;

    const xScale = d3.scaleLinear()
      .domain([-2, 2])
      .range([margin.left, width - margin.right]);

    const yScale = d3.scaleLinear()
      .domain([0, 5])
      .range([height - margin.bottom, margin.top]);

    // Draw Plate
    const plateWidth = xScale(szRight) - xScale(szLeft);
    svg.append('path')
      .attr('d', `M ${xScale(szLeft)} ${yScale(0.2)} L ${xScale(szRight)} ${yScale(0.2)} L ${xScale(szRight)} ${yScale(0.1)} L ${xScale(0)} ${yScale(0)} L ${xScale(szLeft)} ${yScale(0.1)} Z`)
      .attr('fill', '#334155')
      .attr('stroke', '#475569');

    // Draw Strike Zone
    svg.append('rect')
      .attr('x', xScale(szLeft))
      .attr('y', yScale(szTop))
      .attr('width', plateWidth)
      .attr('height', yScale(szBottom) - yScale(szTop))
      .attr('fill', 'none')
      .attr('stroke', '#64748b')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '4');

    // Draw 3x3 Grid
    const szWidth = szRight - szLeft;
    const szHeight = szTop - szBottom;

    // Vertical grid lines
    [1, 2].forEach(i => {
      const x = szLeft + (szWidth * i / 3);
      svg.append('line')
        .attr('x1', xScale(x))
        .attr('y1', yScale(szTop))
        .attr('x2', xScale(x))
        .attr('y2', yScale(szBottom))
        .attr('stroke', '#475569')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '2');
    });

    // Horizontal grid lines
    [1, 2].forEach(i => {
      const y = szBottom + (szHeight * i / 3);
      svg.append('line')
        .attr('x1', xScale(szLeft))
        .attr('y1', yScale(y))
        .attr('x2', xScale(szRight))
        .attr('y2', yScale(y))
        .attr('stroke', '#475569')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '2');
    });

    // Draw Pitches
    const filteredPitches = pitches.filter(p => p.px !== null && p.pz !== null);
    svg.selectAll('.pitch')
      .data(filteredPitches)
      .enter()
      .append('circle')
      .attr('class', 'pitch')
      .attr('cx', (d: any) => xScale(d.px!))
      .attr('cy', (d: any) => yScale(d.pz!))
      .attr('r', (d: any) => d.pitch_id === selectedPitchId ? 8 : 5)
      .attr('fill', (d: any) => {
        if (d.result.toLowerCase().includes('strike')) return '#ef4444';
        if (d.result.toLowerCase().includes('ball')) return '#3b82f6';
        return '#10b981';
      })
      .attr('stroke', (d: any) => d.pitch_id === selectedPitchId ? '#000' : 'none')
      .attr('stroke-width', 2)
      .attr('opacity', (d: any) => selectedPitchId ? (d.pitch_id === selectedPitchId ? 1 : 0.3) : 0.8);

  }, [pitches, selectedPitchId]);

  return (
    <div className="flex flex-col items-center bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-none">
      <h3 className="text-sm font-semibold text-slate-400 mb-2 uppercase tracking-wider">Strike Zone</h3>
      <svg ref={svgRef} width="300" height="400" className="overflow-visible" />
      <div className="flex gap-4 mt-4 text-xs font-medium">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-red-500" /> <span className="text-slate-300">Strike</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-blue-500" /> <span className="text-slate-300">Ball</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-emerald-500" /> <span className="text-slate-300">In Play</span>
        </div>
      </div>
      {selectedPitchId && (
        <div className="mt-4 w-full bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <p className="text-[9px] text-slate-500 uppercase font-bold">Velocity</p>
              <p className="text-xs font-mono font-bold text-slate-100">
                {pitches.find(p => p.pitch_id === selectedPitchId)?.velocity || '--'} <span className="text-[9px] text-slate-500 font-normal">MPH</span>
              </p>
            </div>
            <div className="text-center">
              <p className="text-[9px] text-slate-500 uppercase font-bold">Spin Rate</p>
              <p className="text-xs font-mono font-bold text-slate-100">
                {pitches.find(p => p.pitch_id === selectedPitchId)?.spin_rate || '--'} <span className="text-[9px] text-slate-500 font-normal">RPM</span>
              </p>
            </div>
            <div className="text-center">
              <p className="text-[9px] text-slate-500 uppercase font-bold">Extension</p>
              <p className="text-xs font-mono font-bold text-slate-100">
                {pitches.find(p => p.pitch_id === selectedPitchId)?.extension?.toFixed(1) || '--'} <span className="text-[9px] text-slate-500 font-normal">FT</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StrikeZone;
