export type Course = {
    id: number;
    code: string;
    name: string;
    professor: string;
    rating: number;
    difficulty: number;
    avg_gpa: number;
    reviews: number;
    department: string;
    description: string;
  };
  
export type Review = {
  id: number;
  course_id: number;
  student_profile_id: number;
  rating: number;
  difficulty: number;
  grade: string | null;
  semester: string | null;
  professor_name: string | null;
  hours_per_week: number | null;
  comment: string | null;
  created_at: string;
};

export type Reply = {
  id: number;
  review_id: number;
  student_profile_id: number;
  parent_reply_id: number | null;
  content: string;
  created_at: string;
};