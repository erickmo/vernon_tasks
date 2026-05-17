import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, useParams } from "react-router-dom";
import { PageLayout } from "../layouts/PageLayout";
import { parsePeriod } from "./lib/periodParser";
import * as objApi from "./api/objectives";
import { useObjective } from "./hooks/useObjective";
import * as telemetry from "../../telemetry";

const schema = z
  .object({
    title: z.string().min(1, "Title is required").max(140),
    period: z.string().min(1, "Period is required"),
    period_start: z.string().min(1, "Start date required"),
    period_end: z.string().min(1, "End date required"),
    objective_owner: z.string().min(1, "Owner is required"),
    status: z.enum(["Open", "On Track", "At Risk", "Closed"]),
    pdca_phase: z.enum(["PLAN", "DO", "CHECK", "ACT", "CLOSED"]),
    description: z.string().optional(),
  })
  .refine((d) => d.period_start <= d.period_end, {
    message: "Start must be ≤ end",
    path: ["period_end"],
  });

type FormValues = z.infer<typeof schema>;

export interface ObjectiveEditorProps {
  mode: "create" | "edit";
}

export function ObjectiveEditor({ mode }: ObjectiveEditorProps) {
  const nav = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const existing = useObjective(mode === "edit" ? id : null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      period: "",
      period_start: "",
      period_end: "",
      objective_owner: "",
      status: "Open",
      pdca_phase: "PLAN",
      description: "",
    },
  });

  useEffect(() => {
    if (mode === "edit" && existing.data) {
      const o = existing.data.objective as Record<string, unknown>;
      setValue("title", (o.title as string) ?? "");
      setValue("period", (o.period as string) ?? "");
      setValue("period_start", (o.period_start as string) ?? "");
      setValue("period_end", (o.period_end as string) ?? "");
      setValue("objective_owner", (o.objective_owner as string) ?? "");
      setValue("status", ((o.status as FormValues["status"]) ?? "Open"));
      setValue("pdca_phase", ((o.pdca_phase as FormValues["pdca_phase"]) ?? "PLAN"));
      setValue("description", (o.description as string) ?? "");
    }
  }, [mode, existing.data, setValue]);

  function onPeriodBlur() {
    const period = watch("period");
    const parsed = parsePeriod(period);
    if (parsed) {
      setValue("period_start", parsed.start, { shouldValidate: true });
      setValue("period_end", parsed.end, { shouldValidate: true });
    }
  }

  async function onSubmit(values: FormValues) {
    if (mode === "create") {
      const res = (await objApi.createObjective(values)) as { data?: { name?: string } } | undefined;
      const newName = res?.data?.name;
      if (newName) telemetry.trackOkrObjectiveCreate(newName);
      nav(newName ? `/portal/okr?obj=${encodeURIComponent(newName)}` : "/portal/okr");
    } else if (id) {
      await objApi.updateObjective(id, values);
      telemetry.trackOkrObjectiveEdit(id);
      nav(`/portal/okr?obj=${encodeURIComponent(id)}`);
    }
  }

  return (
    <PageLayout title={mode === "create" ? "New Objective" : "Edit Objective"}>
      <form onSubmit={handleSubmit(onSubmit)} className="okr-editor">
        <label>
          Title
          <input {...register("title")} />
          {errors.title && <span role="alert">{errors.title.message}</span>}
        </label>
        <label>
          Period
          <input {...register("period")} onBlur={onPeriodBlur} />
          {errors.period && <span role="alert">{errors.period.message}</span>}
        </label>
        <label>
          Period start
          <input type="date" {...register("period_start")} />
          {errors.period_start && <span role="alert">{errors.period_start.message}</span>}
        </label>
        <label>
          Period end
          <input type="date" {...register("period_end")} />
          {errors.period_end && <span role="alert">{errors.period_end.message}</span>}
        </label>
        <label>
          Owner
          <input {...register("objective_owner")} />
          {errors.objective_owner && <span role="alert">{errors.objective_owner.message}</span>}
        </label>
        <label>
          Status
          <select {...register("status")}>
            <option>Open</option>
            <option>On Track</option>
            <option>At Risk</option>
            <option>Closed</option>
          </select>
        </label>
        <label>
          PDCA
          <select {...register("pdca_phase")}>
            <option>PLAN</option>
            <option>DO</option>
            <option>CHECK</option>
            <option>ACT</option>
            <option>CLOSED</option>
          </select>
        </label>
        <label>
          Description
          <textarea {...register("description")} />
        </label>
        <div className="okr-editor__actions">
          <button type="submit">Save</button>
          <button type="button" onClick={() => nav(-1)}>Cancel</button>
        </div>
      </form>
    </PageLayout>
  );
}
