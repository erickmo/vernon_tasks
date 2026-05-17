import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, useParams } from "react-router-dom";
import { PageLayout } from "../layouts/PageLayout";
import * as projApi from "./api/projects";
import { useProject } from "./hooks/useProject";
import { PROJECT_STATUSES } from "./lib/projectStatus";
import * as telemetry from "../../telemetry";

const PDCA_OPTIONS = ["PLAN", "DO", "CHECK", "ACT", "CLOSED"] as const;

const schema = z
  .object({
    title: z.string().min(1, "Title is required").max(140),
    project_owner: z.string().min(1, "Owner is required"),
    project_leader: z.string().min(1, "Leader is required"),
    start_date: z.string().min(1, "Start date required"),
    end_date: z.string().min(1, "End date required"),
    status: z.enum(PROJECT_STATUSES),
    pdca_phase: z.enum(PDCA_OPTIONS),
    objective: z.string().optional(),
    blocked_days_threshold: z.coerce.number().int().min(0).max(365),
    slip_pct_threshold: z.coerce.number().min(0).max(100),
    capacity_pct_threshold: z.coerce.number().min(0).max(100),
  })
  .refine((d) => d.start_date <= d.end_date, {
    message: "Start must be ≤ end",
    path: ["end_date"],
  });

type FormValues = z.infer<typeof schema>;

export interface ProjectEditorProps {
  mode: "create" | "edit";
}

export function ProjectEditor({ mode }: ProjectEditorProps) {
  const nav = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const existing = useProject(mode === "edit" ? id : null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      title: "",
      project_owner: "",
      project_leader: "",
      start_date: "",
      end_date: "",
      status: "Open",
      pdca_phase: "PLAN",
      objective: "",
      blocked_days_threshold: 7,
      slip_pct_threshold: 20,
      capacity_pct_threshold: 80,
    },
  });

  useEffect(() => {
    if (mode === "edit" && existing.data) {
      const p = existing.data.project as Record<string, any>;
      setValue("title", p.title ?? "");
      setValue("project_owner", p.project_owner ?? "");
      setValue("project_leader", p.project_leader ?? "");
      setValue("start_date", p.start_date ?? "");
      setValue("end_date", p.end_date ?? "");
      setValue("status", p.status ?? "Open");
      setValue("pdca_phase", p.pdca_phase ?? "PLAN");
      setValue("objective", p.objective ?? "");
      setValue("blocked_days_threshold", p.blocked_days_threshold ?? 7);
      setValue("slip_pct_threshold", p.slip_pct_threshold ?? 20);
      setValue("capacity_pct_threshold", p.capacity_pct_threshold ?? 80);
    }
  }, [mode, existing.data, setValue]);

  async function onSubmit(values: FormValues) {
    if (mode === "create") {
      const res = (await projApi.createProject(values)) as any;
      const newName = res?.data?.name;
      if (newName) telemetry.trackProjectsCreate(newName);
      nav(newName ? `/portal/projects?proj=${encodeURIComponent(newName)}` : "/portal/projects");
    } else if (id) {
      await projApi.updateProject(id, values);
      telemetry.trackProjectsEdit(id);
      nav(`/portal/projects?proj=${encodeURIComponent(id)}`);
    }
  }

  return (
    <PageLayout title={mode === "create" ? "New Project" : "Edit Project"}>
      <form onSubmit={handleSubmit(onSubmit)} className="projects-editor">
        <label>
          Title
          <input {...register("title")} />
          {errors.title && <span role="alert">{errors.title.message}</span>}
        </label>
        <label>
          Leader
          <input {...register("project_leader")} />
          {errors.project_leader && <span role="alert">{errors.project_leader.message}</span>}
        </label>
        <label>
          Owner
          <input {...register("project_owner")} />
          {errors.project_owner && <span role="alert">{errors.project_owner.message}</span>}
        </label>
        <label>
          Start date
          <input type="date" {...register("start_date")} />
          {errors.start_date && <span role="alert">{errors.start_date.message}</span>}
        </label>
        <label>
          End date
          <input type="date" {...register("end_date")} />
          {errors.end_date && <span role="alert">{errors.end_date.message}</span>}
        </label>
        <label>
          Status
          <select {...register("status")}>
            {PROJECT_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          PDCA
          <select {...register("pdca_phase")}>
            {PDCA_OPTIONS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Objective (optional)
          <input {...register("objective")} />
        </label>
        <label>
          Blocked days threshold
          <input type="number" {...register("blocked_days_threshold")} />
          {errors.blocked_days_threshold && (
            <span role="alert">{errors.blocked_days_threshold.message}</span>
          )}
        </label>
        <label>
          Slip % threshold
          <input type="number" {...register("slip_pct_threshold")} />
          {errors.slip_pct_threshold && (
            <span role="alert">{errors.slip_pct_threshold.message}</span>
          )}
        </label>
        <label>
          Capacity % threshold
          <input type="number" {...register("capacity_pct_threshold")} />
          {errors.capacity_pct_threshold && (
            <span role="alert">{errors.capacity_pct_threshold.message}</span>
          )}
        </label>
        <div className="projects-editor__actions">
          <button type="submit">Save</button>
          <button type="button" onClick={() => nav(-1)}>
            Cancel
          </button>
        </div>
      </form>
    </PageLayout>
  );
}
