export const schoolSelectionKey = () => 'ukeplanen.selectedSchool';
export function validSchool(schoolId, schools) {return typeof schoolId==='string' && Object.hasOwn(schools,schoolId);}
export function gradeSelectionKey(schoolId) {return `ukeplanen.grade.${schoolId}`;}
export function validGrade(grade, grades) {return typeof grade==='string' && Object.hasOwn(grades,grade);}
export function progressKey(schoolId, grade, year, week, section, day='all') {
  return ['ukeplanen','checked',schoolId,grade,year,week,section,day].join('.');
}
