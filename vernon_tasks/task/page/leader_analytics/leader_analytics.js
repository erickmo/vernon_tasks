frappe.pages['leader-analytics'].on_page_load = function(wrapper) {
  const page = frappe.ui.make_app_page({
    parent: wrapper,
    title: __('Leader Analytics'),
    single_column: true,
  });

  const $body = $(wrapper).find('.layout-main-section');
  $body.html(`
    <div class="vt-analytics-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div class="vt-card" id="vt-burndown" style="border:1px solid var(--border-color);padding:12px;border-radius:8px;"><h5>${__('Burndown')}</h5><div class="chart"></div><div class="note text-muted small"></div></div>
      <div class="vt-card" id="vt-velocity" style="border:1px solid var(--border-color);padding:12px;border-radius:8px;"><h5>${__('Velocity Trend')}</h5><div class="chart"></div><div class="note text-muted small"></div></div>
      <div class="vt-card" id="vt-forecast" style="border:1px solid var(--border-color);padding:12px;border-radius:8px;"><h5>${__('Forecast')}</h5><div class="content"></div></div>
      <div class="vt-card" id="vt-risks" style="border:1px solid var(--border-color);padding:12px;border-radius:8px;"><h5>${__('Risks')}</h5><div class="content"></div></div>
    </div>
  `);

  const state = { project: null, sprint: null };

  const project_field = page.add_field({
    fieldname: 'project',
    label: __('Project'),
    fieldtype: 'Link',
    options: 'VT Project',
    change: () => {
      state.project = project_field.get_value();
      refresh();
    },
  });

  const sprint_field = page.add_field({
    fieldname: 'sprint',
    label: __('Sprint'),
    fieldtype: 'Link',
    options: 'VT Sprint',
    get_query: () => ({ filters: { project: state.project } }),
    change: () => {
      state.sprint = sprint_field.get_value();
      render_burndown();
    },
  });

  function call(method, args) {
    return frappe.call({
      method: `vernon_tasks.task.api.analytics.${method}`,
      args,
    }).then(r => r.message);
  }

  function refresh() {
    if (!state.project) return;
    render_velocity();
    render_forecast();
    render_risks();
  }

  function render_burndown() {
    if (!state.sprint) return;
    call('get_burndown', { sprint: state.sprint }).then(data => {
      $('#vt-burndown .chart').empty();
      new frappe.Chart('#vt-burndown .chart', {
        type: 'line',
        data: {
          labels: data.labels,
          datasets: [
            { name: __('Ideal'), values: data.ideal },
            { name: __('Remaining'), values: data.remaining },
          ],
        },
        height: 240,
      });
      $('#vt-burndown .note').text(
        data.unestimated_count ? __('{0} tasks unestimated', [data.unestimated_count]) : ''
      );
    });
  }

  function render_velocity() {
    call('get_velocity_trend', { project: state.project, n: 6 }).then(data => {
      $('#vt-velocity .chart').empty();
      if (!data.sprints.length) {
        $('#vt-velocity .note').text(__('No closed sprints yet'));
        return;
      }
      new frappe.Chart('#vt-velocity .chart', {
        type: 'bar',
        data: {
          labels: data.sprints,
          datasets: [{ name: __('Hours'), values: data.velocity }],
          yMarkers: [{ label: __('avg'), value: data.avg }],
        },
        height: 240,
      });
      const arrow = data.trend_pct > 0 ? '↑' : (data.trend_pct < 0 ? '↓' : '→');
      $('#vt-velocity .note').text(
        __('Avg: {0}h | Trend: {1} {2}%', [data.avg.toFixed(1), arrow, Math.abs(data.trend_pct).toFixed(1)])
      );
    });
  }

  function render_forecast() {
    call('get_forecast', { project: state.project }).then(data => {
      const $c = $('#vt-forecast .content').empty();
      if (data.insufficient_data) {
        $c.text(__('Need {0} more closed sprint(s) for forecast', [data.sprints_needed]));
        return;
      }
      $c.html(`
        <div><strong>${__('Predicted end')}:</strong> ${frappe.utils.escape_html(data.predicted_end)}</div>
        <div class="text-muted small">${__('Range')}: ${frappe.utils.escape_html(data.p_max)} – ${frappe.utils.escape_html(data.p_min)}</div>
        <div class="text-muted small">${__('Confidence')}: ${(data.confidence * 100).toFixed(0)}%</div>
        <div class="text-muted small">${__('Remaining')}: ${data.remaining_hours}h / ${__('Avg velocity')}: ${data.avg_velocity}h</div>
      `);
    });
  }

  function render_risks() {
    call('get_risks', { project: state.project }).then(risks => {
      const $c = $('#vt-risks .content').empty();
      if (!risks.length) {
        $c.text(__('No risks detected'));
        return;
      }
      const sev_color = { low: '#6c757d', med: '#fd7e14', high: '#dc3545' };
      risks.forEach(r => {
        const color = sev_color[r.severity] || '#999';
        $c.append(`
          <div style="border-left:4px solid ${color};padding:6px 10px;margin-bottom:6px;">
            <strong>[${frappe.utils.escape_html(r.type)}]</strong>
            ${frappe.utils.escape_html(r.detail)}
          </div>
        `);
      });
    });
  }
};
