frappe.pages['my-analytics'].on_page_load = function(wrapper) {
  const page = frappe.ui.make_app_page({
    parent: wrapper,
    title: __('My Analytics'),
    single_column: true,
  });

  const $body = $(wrapper).find('.layout-main-section');
  $body.html(`
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;">
      <div id="ic-velocity" style="border:1px solid var(--border-color);padding:12px;border-radius:8px;">
        <h5>${__('Personal Velocity')}</h5>
        <div class="chart"></div>
        <div class="note text-muted small"></div>
      </div>
      <div id="ic-streak" style="border:1px solid var(--border-color);padding:12px;border-radius:8px;">
        <h5>${__('Current Streak')}</h5>
        <div class="content"></div>
      </div>
      <div id="ic-leaderboard" style="grid-column:1/-1;border:1px solid var(--border-color);padding:12px;border-radius:8px;">
        <h5>${__('Leaderboard')}</h5>
        <div class="chart"></div>
      </div>
    </div>
  `);

  const state = { project: null, period: 'month' };

  const project_field = page.add_field({
    fieldname: 'project',
    label: __('Project'),
    fieldtype: 'Link',
    options: 'VT Project',
    change: () => {
      state.project = project_field.get_value();
      render_velocity();
      render_streak();
    },
  });

  const period_field = page.add_field({
    fieldname: 'period',
    label: __('Period'),
    fieldtype: 'Select',
    options: 'week\nmonth\nquarter',
    default: 'month',
    change: () => {
      state.period = period_field.get_value();
      render_leaderboard();
    },
  });

  function call(method, args) {
    return frappe.call({
      method: `vernon_tasks.task.api.ic_analytics.${method}`,
      args,
    }).then(r => r.message);
  }

  function render_velocity() {
    if (!state.project) return;
    call('get_personal_velocity', { project: state.project, n: 6 }).then(d => {
      $('#ic-velocity .chart').empty();
      if (!d.sprints.length) {
        $('#ic-velocity .chart').text(__('No closed sprints yet'));
        $('#ic-velocity .note').text('');
        return;
      }
      new frappe.Chart('#ic-velocity .chart', {
        type: 'line',
        data: {
          labels: d.sprints,
          datasets: [
            { name: __('Personal'), values: d.personal },
            { name: __('Team avg'), values: d.team_avg },
          ],
        },
        height: 240,
      });
      $('#ic-velocity .note').text(
        __('Your avg: {0}h | Team avg: {1}h', [d.avg.toFixed(1), d.team_avg_total.toFixed(1)])
      );
    });
  }

  function render_streak() {
    if (!state.project) return;
    call('get_streak', { project: state.project }).then(d => {
      $('#ic-streak .content').html(`
        <div style="font-size:48px;font-weight:700;line-height:1;">${d.streak}</div>
        <div class="text-muted small">${__('consecutive sprints active')}</div>
        <div class="text-muted small">${__('out of {0} closed', [d.sprints_checked])}</div>
      `);
    });
  }

  function render_leaderboard() {
    call('get_leaderboard', { period: state.period, limit: 10 }).then(rows => {
      $('#ic-leaderboard .chart').empty();
      if (!rows.length) {
        $('#ic-leaderboard .chart').text(__('No data this period'));
        return;
      }
      new frappe.Chart('#ic-leaderboard .chart', {
        type: 'bar',
        data: {
          labels: rows.map(r => frappe.utils.escape_html(r.user)),
          datasets: [{ name: __('Points'), values: rows.map(r => r.points) }],
        },
        height: 280,
      });
    });
  }

  render_leaderboard();
};
