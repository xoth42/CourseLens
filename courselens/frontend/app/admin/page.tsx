"use client";

import { supabase } from "@/lib/supabase/client";
import { isAdmin } from "@/lib/admins";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const DENIAL_REASONS = [
  "Course already exists in the catalog",
  "Professor not found at UMass",
  "Course not offered at UMass",
  "Incomplete or inaccurate information",
  "Duplicate request",
  "Other",
];

type CourseRequest = {
  id: number;
  subject: string;
  course_number: string;
  class_name: string;
  description: string | null;
  professor_name: string;
  credits: number | null;
  requested_by_user_id: string;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
};

const SEMESTERS = ["Spring 2026", "Fall 2025", "Spring 2025", "Fall 2024", "Spring 2024", "Fall 2023"];

type EditDraft = {
  subject: string;
  course_number: string;
  class_name: string;
  professor_name: string;
  description: string;
  semester: string;
};

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<CourseRequest[]>([]);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Deny state
  const [denyingId, setDenyingId] = useState<number | null>(null);
  const [selectedReason, setSelectedReason] = useState("");
  const [customReason, setCustomReason] = useState("");

  // Approve edit state
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !isAdmin(user.email)) {
        router.replace("/courses");
        return;
      }
      const { data, error } = await supabase
        .from("class_add_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) setError(error.message);
      else setRequests(data ?? []);
      setLoading(false);
    }
    init();
  }, [router]);

  function openApprovePanel(req: CourseRequest) {
    setApprovingId(req.id);
    setEditDraft({
      subject: req.subject,
      course_number: req.course_number,
      class_name: req.class_name,
      professor_name: req.professor_name,
      description: req.description ?? "",
      semester: SEMESTERS[0],
    });
    setError(null);
  }

  function closeApprovePanel() {
    setApprovingId(null);
    setEditDraft(null);
  }

  function openDenyPanel(id: number) {
    setDenyingId(id);
    setSelectedReason("");
    setCustomReason("");
    setError(null);
  }

  function closeDenyPanel() {
    setDenyingId(null);
    setSelectedReason("");
    setCustomReason("");
  }

  async function handleApproveConfirm(req: CourseRequest) {
    if (!editDraft) return;
    setActionLoading(req.id);
    setError(null);

    const code = `${editDraft.subject.toUpperCase()} ${editDraft.course_number}`;

    // 1. Insert into classes
    const { data: newClass, error: classError } = await supabase
      .from("classes")
      .insert({
        course_number: code,
        name: editDraft.class_name,
        subject: editDraft.subject.toUpperCase(),
        description: editDraft.description,
      })
      .select("id")
      .single();

    if (classError) {
      setError(`Failed to add course: ${classError.message}`);
      setActionLoading(null);
      return;
    }

    // 2. Find or create professor
    let profId: number | null = null;
    const { data: existingProf } = await supabase
      .from("professor")
      .select("id")
      .eq("name", editDraft.professor_name)
      .maybeSingle();

    if (existingProf) {
      profId = existingProf.id;
    } else {
      const { data: newProf, error: profError } = await supabase
        .from("professor")
        .insert({ name: editDraft.professor_name })
        .select("id")
        .single();
      if (profError) {
        setError(`Course added but failed to create professor: ${profError.message}`);
        setActionLoading(null);
        return;
      }
      profId = newProf.id;
    }

    // 3. Link professor to class
    const { error: linkError } = await supabase
      .from("professor_classes")
      .insert({ class_id: newClass.id, prof_id: profId, semester: editDraft.semester });

    if (linkError) {
      setError(`Course added but failed to link professor: ${linkError.message}`);
      setActionLoading(null);
      return;
    }

    // 4. Mark request as accepted
    const { error: updateError } = await supabase
      .from("class_add_requests")
      .update({ status: "accepted" })
      .eq("id", req.id);

    if (updateError) setError(`Course added but status update failed: ${updateError.message}`);
    else {
      setRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: "accepted" } : r));
      closeApprovePanel();
    }

    setActionLoading(null);
  }

  async function handleDenyConfirm(req: CourseRequest) {
    const reason = selectedReason === "Other" ? customReason.trim() : selectedReason;
    if (!reason) {
      setError("Please select or enter a reason.");
      return;
    }

    setActionLoading(req.id);
    setError(null);

    const { error: updateError } = await supabase
      .from("class_add_requests")
      .update({ status: "rejected", denial_reason: reason })
      .eq("id", req.id);

    if (updateError) setError(updateError.message);
    else {
      setRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: "rejected" } : r));
      closeDenyPanel();
    }

    setActionLoading(null);
  }

  const pending = requests.filter((r) => r.status === "pending");

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-6 py-10">

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Course Requests</h1>
          <p className="text-gray-500 mt-1">Review and action submitted course requests.</p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-base font-semibold text-gray-800">Pending</h2>
            {pending.length > 0 && (
              <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                {pending.length}
              </span>
            )}
          </div>

          {pending.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white px-5 py-8 text-center">
              <p className="text-sm text-gray-400">No pending requests — all caught up.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {pending.map((req) => (
                <RequestCard
                  key={req.id}
                  req={req}
                  actionLoading={actionLoading}
                  approvingId={approvingId}
                  editDraft={editDraft}
                  denyingId={denyingId}
                  selectedReason={selectedReason}
                  customReason={customReason}
                  onEditDraftChange={setEditDraft}
                  onSelectedReasonChange={setSelectedReason}
                  onCustomReasonChange={setCustomReason}
                  onApproveOpen={openApprovePanel}
                  onApproveCancel={closeApprovePanel}
                  onApproveConfirm={handleApproveConfirm}
                  onDenyOpen={openDenyPanel}
                  onDenyCancel={closeDenyPanel}
                  onDenyConfirm={handleDenyConfirm}
                />
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}

function RequestCard({
  req,
  actionLoading,
  approvingId,
  editDraft,
  denyingId,
  selectedReason,
  customReason,
  onEditDraftChange,
  onSelectedReasonChange,
  onCustomReasonChange,
  onApproveOpen,
  onApproveCancel,
  onApproveConfirm,
  onDenyOpen,
  onDenyCancel,
  onDenyConfirm,
}: {
  req: CourseRequest;
  actionLoading: number | null;
  approvingId: number | null;
  editDraft: EditDraft | null;
  denyingId: number | null;
  selectedReason: string;
  customReason: string;
  onEditDraftChange: (d: EditDraft) => void;
  onSelectedReasonChange: (v: string) => void;
  onCustomReasonChange: (v: string) => void;
  onApproveOpen: (r: CourseRequest) => void;
  onApproveCancel: () => void;
  onApproveConfirm: (r: CourseRequest) => void;
  onDenyOpen: (id: number) => void;
  onDenyCancel: () => void;
  onDenyConfirm: (r: CourseRequest) => void;
}) {
  const isLoading = actionLoading === req.id;
  const isApproveOpen = approvingId === req.id;
  const isDenyOpen = denyingId === req.id;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">

      {/* Main info */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-base font-bold text-gray-900">
                {req.subject.toUpperCase()}{req.course_number}
              </span>
              <span className="text-base text-gray-700">{req.class_name}</span>
            </div>
            <p className="text-sm text-gray-500">
              Prof. {req.professor_name}
              {req.credits ? <span className="text-gray-400"> · {req.credits} credits</span> : null}
            </p>
            {req.description && (
              <p className="text-sm text-gray-600 mt-2 leading-relaxed line-clamp-3">{req.description}</p>
            )}
            <p className="text-xs text-gray-400 mt-2">
              Submitted {new Date(req.created_at).toLocaleDateString("en-US", {
                month: "long", day: "numeric", year: "numeric",
              })}
            </p>
          </div>

          {!isApproveOpen && !isDenyOpen && (
            <div className="flex flex-col gap-2 shrink-0 pt-0.5">
              <button
                onClick={() => onApproveOpen(req)}
                disabled={isLoading}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                Approve
              </button>
              <button
                onClick={() => onDenyOpen(req.id)}
                disabled={isLoading}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Deny
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Approve edit panel */}
      {isApproveOpen && editDraft && (
        <div className="border-t border-blue-100 bg-blue-50 px-5 py-4">
          <p className="text-sm font-semibold text-blue-700 mb-3">Review & edit before approving</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
              <input
                value={editDraft.subject}
                onChange={(e) => onEditDraftChange({ ...editDraft, subject: e.target.value })}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Course number</label>
              <input
                value={editDraft.course_number}
                onChange={(e) => onEditDraftChange({ ...editDraft, course_number: e.target.value })}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
          </div>
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Course name</label>
            <input
              value={editDraft.class_name}
              onChange={(e) => onEditDraftChange({ ...editDraft, class_name: e.target.value })}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Professor name</label>
            <input
              value={editDraft.professor_name}
              onChange={(e) => onEditDraftChange({ ...editDraft, professor_name: e.target.value })}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Semester</label>
            <select
              value={editDraft.semester}
              onChange={(e) => onEditDraftChange({ ...editDraft, semester: e.target.value })}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {SEMESTERS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea
              value={editDraft.description}
              onChange={(e) => onEditDraftChange({ ...editDraft, description: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={onApproveCancel}
              className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onApproveConfirm(req)}
              disabled={isLoading}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isLoading ? "Approving..." : "Confirm Approve"}
            </button>
          </div>
        </div>
      )}

      {/* Deny panel */}
      {isDenyOpen && (
        <div className="border-t border-red-100 bg-red-50 px-5 py-4">
          <p className="text-sm font-semibold text-red-700 mb-3">Select a reason for denial</p>
          <div className="flex flex-col gap-2 mb-3">
            {DENIAL_REASONS.map((reason) => (
              <label key={reason} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name={`reason-${req.id}`}
                  value={reason}
                  checked={selectedReason === reason}
                  onChange={() => onSelectedReasonChange(reason)}
                  className="accent-red-600"
                />
                <span className="text-sm text-gray-700">{reason}</span>
              </label>
            ))}
          </div>
          {selectedReason === "Other" && (
            <textarea
              value={customReason}
              onChange={(e) => onCustomReasonChange(e.target.value)}
              placeholder="Describe the reason..."
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
            />
          )}
          <div className="flex gap-2">
            <button
              onClick={onDenyCancel}
              className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onDenyConfirm(req)}
              disabled={isLoading || !selectedReason || (selectedReason === "Other" && !customReason.trim())}
              className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40 transition-colors"
            >
              {isLoading ? "Denying..." : "Confirm Deny"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
