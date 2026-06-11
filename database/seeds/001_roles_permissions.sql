INSERT OR IGNORE INTO permissions (code, name, description) VALUES
  ('leave_approve', '请假审批', '审批活动请假申请'),
  ('task_publish', '练习任务发布', '创建和管理练习任务'),
  ('feedback_comment', '打卡点评', '查看录音并提交点评'),
  ('library_manage', '谱库管理', '上传和管理作品资料'),
  ('member_manage', '成员管理', '新增、编辑、删除团员'),
  ('attendance_manage', '考勤管理', '查看和调整签到考勤'),
  ('event_manage', '活动管理', '创建和管理排练活动'),
  ('profile_review', '资料审核', '审核成员资料和声部变更'),
  ('notification_send', '通知发送', '发送排练、任务和点评通知');

INSERT OR IGNORE INTO roles (id, code, name, description, built_in, managed_sections, created_at, updated_at) VALUES
  ('role-leader', 'leader', '团长', '全团运营负责人', 1, '["S","A","T","B"]', datetime('now'), datetime('now')),
  ('role-conductor', 'conductor', '指挥', '音乐与排练负责人', 1, '["S","A","T","B"]', datetime('now'), datetime('now')),
  ('role-pianist', 'pianist', '钢琴伴奏', '伴奏与排练支持', 1, '["S","A","T","B"]', datetime('now'), datetime('now')),
  ('role-soprano', 'soprano', '女高', '女高声部成员', 1, '["S"]', datetime('now'), datetime('now')),
  ('role-mezzo', 'mezzo', '女中', '女中/女低声部成员', 1, '["A"]', datetime('now'), datetime('now')),
  ('role-tenor', 'tenor', '男高', '男高声部成员', 1, '["T"]', datetime('now'), datetime('now')),
  ('role-bass', 'bass', '男低', '男低声部成员', 1, '["B"]', datetime('now'), datetime('now')),
  ('role-section-leader', 'section_leader', '声部长', '本声部管理与点评', 1, '[]', datetime('now'), datetime('now')),
  ('role-principal', 'principal', '声部首席', '本声部练习支持', 1, '[]', datetime('now'), datetime('now')),
  ('role-member', 'member', '普通成员', '普通团员', 1, '[]', datetime('now'), datetime('now'));

INSERT OR IGNORE INTO role_permissions (role_id, permission_code) VALUES
  ('role-leader', 'leave_approve'),
  ('role-leader', 'task_publish'),
  ('role-leader', 'feedback_comment'),
  ('role-leader', 'library_manage'),
  ('role-leader', 'member_manage'),
  ('role-leader', 'attendance_manage'),
  ('role-leader', 'event_manage'),
  ('role-leader', 'profile_review'),
  ('role-leader', 'notification_send'),
  ('role-conductor', 'task_publish'),
  ('role-conductor', 'feedback_comment'),
  ('role-conductor', 'library_manage'),
  ('role-conductor', 'event_manage'),
  ('role-section-leader', 'leave_approve'),
  ('role-section-leader', 'feedback_comment'),
  ('role-section-leader', 'attendance_manage'),
  ('role-principal', 'feedback_comment');

-- V2.1 新增权限映射（dashboard / 邀请管理 / 角色管理）
INSERT OR IGNORE INTO role_permissions (role_id, permission_code) VALUES
  ('role-leader', 'dashboard_view'),
  ('role-leader', 'invite_manage'),
  ('role-leader', 'role_manage'),
  ('role-conductor', 'dashboard_view'),
  ('role-section-leader', 'dashboard_view');
