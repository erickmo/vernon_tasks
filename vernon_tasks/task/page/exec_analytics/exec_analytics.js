frappe.pages['exec-analytics'].on_page_load = function(wrapper) {
  const page = frappe.ui.make_app_page({
    parent: wrapper,
    title: __('Executive Analytics'),
    single_column: true,
  });

  const $body = $(wrapper).find('.layout-main-section');
  $body.html(`
    <div style="display:grid;grid-template-columns:1fr 2fr;gap:16px;">
      <div id="ex-health" style="border:1px solid var(--border-color);padding:16px;border-radius:8px;">
        <h5>${__('Company Health Score')}</h5>
        <div class="content"></div>
      </div>
      <div id="ex-okr" style="border:1px solid var(--border-color);padding:12px;border-radius:8px;">
        <h5>${__('OKR Roll-up')}</h5>
        <div class="toolbar" style="display:flex;gap:8px;margin-bottom:8px;"></div>
        <div class="chart"></div>
      </div>
      <div id="ex-kpi" style="grid-column:1/-1;border:1px solid var(--border-color);padding:12px;border-radius:8px;">
        <h5>${__('KPI Trend')}</h5>
        <div class="toolbar" style="display:flex;gap:8px;margin-bottom:8px;"></div>
        <div class="chart"></div>
        <div class="note text-muted small"></div>
      </div>
    </div>
  `);

  const state = { period: '', kpi: null };

  const period_field = page.add_field({
    fieldname: 'period',
    label: __('OKR Period'),
    fieldtype: 'Data',
    description: __('e.g. 2026-Q2; blank = all open'),
    change: () => {
      state.period = period_field.get_value() || '';
      render_okr();
    },
  });

  function call(method, args) {
    return frappe.call({
      method: `vernon_tasks.task.api.exec_analytics.${method}`,
      args,
    }).then(r => r.message);
  }

  function render_health() {
    call('get_health_score').then(d => {
      const color = d.score >= 75 ? '#28a745' : (d.score >= 50 ? '#fd7e14' : '#dc3545');
      $('#ex-health .content').html(`
        <div style="font-size:56px;font-weight:700;line-height:1;color:${color};">${d.score.toFixed(0)}</div>
        <div class="text-muted small">${__('composite 0-100')}</div>
        <hr/>
        <div><strong>OKR:</strong> ${d.okr_pct.toFixed(1)}% <span class="text-muted small">(${(d.breakdown.okr_weight * 100).toFixed(0)}%)</span></div>
        <div><strong>${__('On-time')}:</strong> ${d.ontime_pct.toFixed(1)}% <span class="text-muted small">(${(d.breakdown.ontime_weight * 100).toFixed(0)}%)</span></div>
        <div><strong>${__('Velocity')}:</strong> ${d.velocity_health.toFixed(1)} <span class="text-muted small">(${(d.breakdown.velocity_weight * 100).toFixed(0)}%)</span></div>
      `);
    });
  }

  function render_okr() {
    const args = state.period ? { period: state.period } : {};
    call('get_okr_rollup', args).then(rows => {
      $('#ex-okr .chart').empty();
      if (!rows.length) {
        $('#ex-okr .chart').text(__('No active objectives'));
        return;
      }
      new frappe.Chart('#ex-okr .chart', {
        type: 'bar',
        data: {
          labels: rows.map(r => frappe.utils.escape_html(r.title)),
          datasets: [{ name: __('Progress %'), values: rows.map(r => r.progress) }],
        },
        height: 280,
      });
    });
  }

  function render_kpi_selector() {
    call('list_kpis').then(kpis => {
      const $tb = $('#ex-kpi .toolbar').empty();
      if (!kpis.length) {
        $tb.text(__('No KPIs defined'));
        return;
      }
      const $sel = $(`<select class="form-control" style="max-width:300px;"></select>`);
      kpis.forEach(k => {
        $sel.append(`<option value="${frappe.utils.escape_html(k.name)}">${frappe.utils.escape_html(k.kpi_name)} (${frappe.utils.escape_html(k.unit || '')})</option>`);
      });
      $tb.append($sel);
      state.kpi = $sel.val();
      $sel.on('change', () => { state.kpi = $sel.val(); render_kpi(); });
      render_kpi();
    });
  }

  function render_kpi() {
    if (!state.kpi) return;
    call('get_kpi_trend', { kpi_definition: state.kpi, periods: 12 }).then(d => {
      $('#ex-kpi .chart').empty();
      if (!d.values.length) {
        $('#ex-kpi .chart').text(__('No entries for this KPI'));
        $('#ex-kpi .note').text('');
        return;
      }
      new frappe.Chart('#ex-kpi .chart', {
        type: 'line',
        data: {
          labels: d.labels,
          datasets: [{ name: d.kpi_name, values: d.values }],
        },
        height: 240,
      });
      $('#ex-kpi .note').text(__('Unit: {0}', [d.unit || '—']));
    });
  }

  render_health();
  render_okr();
  render_kpi_selector();
};
