import React from "react";
import { FormSection } from "../setup";
import {
  ClassBuilder,
  LevelCards,
  SectionCards,
  SpecList,
  StructureTree,
} from "../setup/structure";
import {
  createLevel,
  createSection,
  createSpecialization,
  createStructureClass,
  deleteLevel,
  deleteSection,
  deleteSpecialization,
  deleteStructureClass,
  fetchAcademicStructure,
  updateLevel,
  updateSection,
  updateSpecialization,
  updateStructureClass,
  type AcademicStructureData,
  type LevelCategory,
  type StructureClass,
} from "../../lib/academic-structure";

interface AcademicStructureManagerProps {
  footer?: (ctx: {
    data: AcademicStructureData;
    saving: boolean;
    setSaving: (v: boolean) => void;
    setError: (v: string) => void;
    setSuccess: (v: string) => void;
  }) => React.ReactNode;
}

/** Levels → Sections → Specs → Classes manager (setup + School Management). */
export function AcademicStructureManager({
  footer,
}: AcademicStructureManagerProps) {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [data, setData] = React.useState<AcademicStructureData | null>(null);
  const [editingClass, setEditingClass] = React.useState<StructureClass | null>(
    null,
  );

  async function reload() {
    const result = await fetchAcademicStructure();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setData(result.data);
  }

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const result = await fetchAcademicStructure();
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
      } else {
        setData(result.data);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function flash(msg: string) {
    setSuccess(msg);
    setError("");
  }

  async function handleCreateLevel(input: {
    name: string;
    category: LevelCategory;
  }) {
    const result = await createLevel(input);
    if (!result.ok) return result.error;
    flash("Level added.");
    await reload();
    return null;
  }

  async function handleUpdateLevel(input: {
    id: string;
    name: string;
    category: LevelCategory;
  }) {
    const result = await updateLevel(input);
    if (!result.ok) return result.error;
    flash("Level updated.");
    await reload();
    return null;
  }

  async function handleDeleteLevel(id: string) {
    setError("");
    const result = await deleteLevel(id);
    if (!result.ok) {
      setError(result.error);
      return result.error;
    }
    flash("Level removed.");
    await reload();
    return null;
  }

  async function handleCreateSection(input: {
    name: string;
    description?: string | null;
  }) {
    const result = await createSection(input);
    if (!result.ok) return result.error;
    flash("Section added.");
    await reload();
    return null;
  }

  async function handleUpdateSection(input: {
    id: string;
    name: string;
    description?: string | null;
  }) {
    const result = await updateSection(input);
    if (!result.ok) return result.error;
    flash("Section updated.");
    await reload();
    return null;
  }

  async function handleDeleteSection(id: string) {
    setError("");
    const result = await deleteSection(id);
    if (!result.ok) {
      setError(result.error);
      return result.error;
    }
    flash("Section removed.");
    await reload();
    return null;
  }

  async function handleCreateSpec(input: {
    section_id: string;
    name: string;
    abbreviation: string;
    description?: string | null;
  }) {
    const result = await createSpecialization(input);
    if (!result.ok) return result.error;
    flash("Specialization added.");
    await reload();
    return null;
  }

  async function handleUpdateSpec(input: {
    id: string;
    section_id: string;
    name: string;
    abbreviation: string;
    description?: string | null;
  }) {
    const result = await updateSpecialization(input);
    if (!result.ok) return result.error;
    flash("Specialization updated.");
    await reload();
    return null;
  }

  async function handleDeleteSpec(id: string) {
    setError("");
    const result = await deleteSpecialization(id);
    if (!result.ok) {
      setError(result.error);
      return result.error;
    }
    flash("Specialization removed.");
    await reload();
    return null;
  }

  async function handleCreateClass(input: {
    academic_level_id: string;
    section_id: string;
    specialization_id?: string | null;
    name: string;
    capacity?: number | null;
  }) {
    const result = await createStructureClass(input);
    if (!result.ok) return result.error;
    flash("Class created.");
    await reload();
    return null;
  }

  async function handleUpdateClass(input: {
    id: string;
    academic_level_id: string;
    section_id: string;
    specialization_id?: string | null;
    name: string;
    capacity?: number | null;
  }) {
    const result = await updateStructureClass(input);
    if (!result.ok) return result.error;
    flash("Class updated.");
    setEditingClass(null);
    await reload();
    return null;
  }

  async function handleDeleteClass(id: string) {
    setError("");
    const result = await deleteStructureClass(id);
    if (!result.ok) {
      setError(result.error);
      return result.error;
    }
    if (editingClass?.id === id) setEditingClass(null);
    flash("Class removed.");
    await reload();
    return null;
  }

  if (loading || !data) {
    return (
      <p className="text-sm text-slate-500">Loading academic structure…</p>
    );
  }

  return (
    <div className="space-y-5 pb-4">
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </p>
      ) : null}

      <FormSection
        title="1. Academic Levels"
        description="Forms and sixth form stages your school offers."
        layout="stack"
      >
        <LevelCards
          levels={data.levels}
          onCreate={handleCreateLevel}
          onUpdate={handleUpdateLevel}
          onDelete={handleDeleteLevel}
        />
      </FormSection>

      <FormSection
        title="2. Sections"
        description="Broad streams such as General, Commercial, or Technical."
        layout="stack"
      >
        <SectionCards
          sections={data.sections}
          onCreate={handleCreateSection}
          onUpdate={handleUpdateSection}
          onDelete={handleDeleteSection}
        />
      </FormSection>

      <FormSection
        title="3. Specializations"
        description="Optional — attach specific tracks like Electrical under Technical."
        layout="stack"
      >
        <SpecList
          sections={data.sections}
          specializations={data.specializations}
          onCreate={handleCreateSpec}
          onUpdate={handleUpdateSpec}
          onDelete={handleDeleteSpec}
        />
      </FormSection>

      <FormSection
        title="4. Class Builder"
        description="Combine a level, section, and optional specialization into a class."
        layout="stack"
      >
        <ClassBuilder
          levels={data.levels}
          sections={data.sections}
          specializations={data.specializations}
          onCreate={handleCreateClass}
          onUpdate={handleUpdateClass}
          editingClass={editingClass}
          onCancelEdit={() => setEditingClass(null)}
        />
      </FormSection>

      <FormSection
        title="5. Structure Overview"
        description="Your hierarchy as Level → Section → Specialization → Classes."
        layout="stack"
      >
        <StructureTree
          levels={data.levels}
          sections={data.sections}
          specializations={data.specializations}
          classes={data.classes}
          onEditClass={(cls) => {
            setEditingClass(cls);
            setSuccess("");
            setError("");
          }}
          onDeleteClass={handleDeleteClass}
        />
      </FormSection>

      {footer?.({ data, saving, setSaving, setError, setSuccess })}
    </div>
  );
}
