INSERT INTO choirs (id, name, city, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'D大调合唱团', '上海', 'active')
ON CONFLICT DO NOTHING;

INSERT INTO roles (code, name, permissions) VALUES
  ('super_admin', '超级管理员', '["*"]'),
  ('admin', '管理员', '["member:*","event:*","practice:*","library:*","dashboard:read"]'),
  ('conductor', '指挥', '["practice:*","feedback:*","dashboard:read","library:read"]'),
  ('section_leader_s', 'S 声部长', '["section:S","feedback:*","practice:read"]'),
  ('section_leader_a', 'A 声部长', '["section:A","feedback:*","practice:read"]'),
  ('section_leader_t', 'T 声部长', '["section:T","feedback:*","practice:read"]'),
  ('section_leader_b', 'B 声部长', '["section:B","feedback:*","practice:read"]'),
  ('member', '普通成员', '["self:*","event:respond","practice:submit","library:read"]')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, permissions = EXCLUDED.permissions;

INSERT INTO sections (id, choir_id, code, name, english_name, color, sort_order) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'S', '女高', 'Soprano', '#C69F62', 1),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'A', '女低', 'Alto', '#4C6D93', 2),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'T', '男高', 'Tenor', '#4E8A63', 3),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'B', '男低', 'Bass', '#111111', 4)
ON CONFLICT (choir_id, code) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color;

INSERT INTO users (id, name, mobile, password_hash) VALUES
  ('20000000-0000-0000-0000-000000000001', '丁总监', '18800000001', 'CHANGE_TO_BCRYPT_HASH'),
  ('20000000-0000-0000-0000-000000000002', '许团务', '18800000002', 'CHANGE_TO_BCRYPT_HASH'),
  ('20000000-0000-0000-0000-000000000003', '陆指挥', '18800000003', 'CHANGE_TO_BCRYPT_HASH'),
  ('20000000-0000-0000-0000-000000000011', '周亦', '18800000011', 'CHANGE_TO_BCRYPT_HASH'),
  ('20000000-0000-0000-0000-000000000012', '陈声', '18800000012', 'CHANGE_TO_BCRYPT_HASH'),
  ('20000000-0000-0000-0000-000000000013', '梁远', '18800000013', 'CHANGE_TO_BCRYPT_HASH'),
  ('20000000-0000-0000-0000-000000000014', '何宁', '18800000014', 'CHANGE_TO_BCRYPT_HASH'),
  ('20000000-0000-0000-0000-000000000021', '林安', '18800000021', 'CHANGE_TO_BCRYPT_HASH')
ON CONFLICT (mobile) DO NOTHING;

INSERT INTO choir_members (choir_id, user_id, section_id, role_code) VALUES
  ('00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', NULL, 'super_admin'),
  ('00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', NULL, 'admin'),
  ('00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', NULL, 'conductor'),
  ('00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'section_leader_s'),
  ('00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000002', 'section_leader_a'),
  ('00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000003', 'section_leader_t'),
  ('00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000004', 'section_leader_b'),
  ('00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000002', 'member')
ON CONFLICT (choir_id, user_id) DO NOTHING;

INSERT INTO works (id, choir_id, title, composer, status, readiness, copyright_status) VALUES
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '月光', 'Debussy / 合唱改编', 'rehearsing', 78, '内部排练使用')
ON CONFLICT DO NOTHING;

INSERT INTO resources (id, work_id, title, resource_type, section_id, storage_key, version, visibility, is_public) VALUES
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '《月光》总谱', 'score_pdf', NULL, 'works/moon/score-v3.pdf', 'v3', 'choir', false),
  ('40000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000001', 'S 女高示范', 'section_demo_audio', '10000000-0000-0000-0000-000000000001', 'works/moon/soprano-demo.mp3', 'v1', 'section', false),
  ('40000000-0000-0000-0000-000000000012', '30000000-0000-0000-0000-000000000001', 'A 女低示范', 'section_demo_audio', '10000000-0000-0000-0000-000000000002', 'works/moon/alto-demo.mp3', 'v1', 'section', false),
  ('40000000-0000-0000-0000-000000000013', '30000000-0000-0000-0000-000000000001', 'T 男高示范', 'section_demo_audio', '10000000-0000-0000-0000-000000000003', 'works/moon/tenor-demo.mp3', 'v1', 'section', false),
  ('40000000-0000-0000-0000-000000000014', '30000000-0000-0000-0000-000000000001', 'B 男低示范', 'section_demo_audio', '10000000-0000-0000-0000-000000000004', 'works/moon/bass-demo.mp3', 'v1', 'section', false),
  ('40000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-000000000001', '钢琴伴奏', 'accompaniment_audio', NULL, 'works/moon/piano-accompaniment.m4a', 'v1', 'choir', false)
ON CONFLICT DO NOTHING;

INSERT INTO events (id, choir_id, title, event_type, starts_at, location, agenda) VALUES
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '周四晚间排练', 'regular_rehearsal', '2026-05-14 19:30:00+08', '珠江新城排练室 A', '《月光》第17-32小节声部平衡。')
ON CONFLICT DO NOTHING;

INSERT INTO practice_tasks (id, choir_id, work_id, title, segment, brief, deadline, required_count, created_by) VALUES
  ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '《月光》女低声部复练', '第17-32小节', '注意第24小节和声入口。', '2026-05-16 22:00:00+08', 2, '20000000-0000-0000-0000-000000000003')
ON CONFLICT DO NOTHING;

INSERT INTO task_targets (task_id, section_id)
VALUES ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;
