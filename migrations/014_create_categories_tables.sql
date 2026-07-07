-- Categories/subcategories taxonomy for Services and Projects, plus seed data
-- for the initial 21 top-level categories. Distinct from the legacy free-text
-- `category` column used on posts/ads/jobs/events.

CREATE TABLE categories (
  id        INT          NOT NULL AUTO_INCREMENT,
  slug      VARCHAR(100) NOT NULL,
  name      VARCHAR(150) NOT NULL,
  sortOrder INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_slug (slug)
);

CREATE TABLE subcategories (
  id         INT          NOT NULL AUTO_INCREMENT,
  categoryId INT          NOT NULL,
  slug       VARCHAR(100) NOT NULL,
  name       VARCHAR(150) NOT NULL,
  sortOrder  INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_subcategories_category_slug (categoryId, slug),
  FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE project_categories (
  projectId     INT      NOT NULL,
  subcategoryId INT      NOT NULL,
  PRIMARY KEY (projectId, subcategoryId),
  FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (subcategoryId) REFERENCES subcategories(id) ON DELETE CASCADE
);

CREATE TABLE service_categories (
  serviceId     INT      NOT NULL,
  subcategoryId INT      NOT NULL,
  PRIMARY KEY (serviceId, subcategoryId),
  FOREIGN KEY (serviceId) REFERENCES services(id) ON DELETE CASCADE,
  FOREIGN KEY (subcategoryId) REFERENCES subcategories(id) ON DELETE CASCADE
);

-- Top-level categories

INSERT INTO categories (id, slug, name, sortOrder) VALUES
  (1,  'architecture',      'Architecture Services',       1),
  (2,  'construction',      'Construction Services',       2),
  (3,  'engineering',       'Engineering Services',        3),
  (4,  'business',          'Business Services',           4),
  (5,  'accounting',        'Accounting Services',         5),
  (6,  'finance',           'Finance Services',            6),
  (7,  'marketing',         'Marketing Services',          7),
  (8,  'communication',     'Communication Services',      8),
  (9,  'social-media',      'Social Media Services',       9),
  (10, 'media',             'Media Services',              10),
  (11, 'creative-design',   'Creative Design Services',    11),
  (12, 'technology',        'Technology Services',         12),
  (13, 'education',         'Education Services',          13),
  (14, 'language',          'Language Services',           14),
  (15, 'agriculture',       'Agriculture Services',        15),
  (16, 'landscape',         'Landscape Services',          16),
  (17, 'animal-science',    'Animal Science Services',     17),
  (18, 'nutrition',         'Nutrition Services',          18),
  (19, 'wellness-fitness',  'Wellness & Fitness Services', 19),
  (20, 'hospitality',       'Hospitality Services',        20),
  (21, 'events',            'Event Services',              21);

-- Subcategories

INSERT INTO subcategories (categoryId, slug, name, sortOrder) VALUES
  -- Architecture Services (1)
  (1, 'residential-commercial-design', 'Residential and commercial architectural design', 1),
  (1, 'blueprints-conceptual-designs', 'Creation of blueprints and conceptual designs', 2),
  (1, '3d-modeling', '3D modeling of spaces and buildings', 3),
  (1, 'interior-design', 'Interior design', 4),
  (1, 'remodeling-proposals', 'Remodeling proposals', 5),
  (1, 'visual-project-presentations', 'Visual project presentations', 6),

  -- Construction Services (2)
  (2, 'construction-estimates', 'Basic construction estimates', 1),
  (2, 'construction-project-planning', 'Construction project planning', 2),
  (2, 'project-documentation', 'Project documentation', 3),
  (2, 'materials-costs-organization', 'Organization of materials and costs', 4),
  (2, 'construction-project-management', 'Project management', 5),
  (2, 'construction-process-analysis', 'Analysis of construction processes', 6),
  (2, 'on-site-supervision-support', 'Support with on-site supervision', 7),

  -- Engineering Services (3)
  (3, 'structural-design', 'Structural design and engineering solutions', 1),
  (3, 'basic-technical-evaluations', 'Basic technical evaluations', 2),
  (3, 'energy-efficiency-analysis', 'Energy efficiency analysis', 3),
  (3, 'project-optimization-solutions', 'Project optimization solutions', 4),
  (3, 'technical-models-analysis', 'Technical models and analysis', 5),
  (3, 'design-planning-support', 'Support with project design and planning', 6),

  -- Business Services (4)
  (4, 'small-business-administration', 'Small business administration', 1),
  (4, 'business-organization', 'Business organization', 2),
  (4, 'market-research', 'Market research', 3),
  (4, 'business-plans', 'Business plans', 4),
  (4, 'administrative-processes', 'Development of administrative processes', 5),
  (4, 'business-growth-strategies', 'Business growth strategies', 6),
  (4, 'basic-business-consulting', 'Basic business consulting', 7),

  -- Accounting Services (5)
  (5, 'small-business-accounting', 'Accounting for small businesses', 1),
  (5, 'financial-records-organization', 'Organization of financial records', 2),
  (5, 'financial-reports-preparation', 'Preparation of financial reports', 3),
  (5, 'expense-tracking', 'Expense tracking', 4),
  (5, 'accounting-documents-organization', 'Organization of accounting documents', 5),
  (5, 'accounting-systems-support', 'Support with accounting systems', 6),

  -- Finance Services (6)
  (6, 'personal-business-budgeting', 'Personal and business budgeting', 1),
  (6, 'basic-financial-analysis', 'Basic financial analysis', 2),
  (6, 'personal-financial-education', 'Personal financial education', 3),
  (6, 'family-financial-education', 'Financial education for families', 4),
  (6, 'financial-planning', 'Financial planning', 5),
  (6, 'investments-markets-education', 'Investments and financial markets education', 6),
  (6, 'wealth-building', 'Wealth building', 7),

  -- Marketing Services (7)
  (7, 'digital-marketing-strategies', 'Digital marketing strategies', 1),
  (7, 'advertising-lead-generation', 'Advertising and lead generation', 2),
  (7, 'ad-campaigns', 'Ad campaigns', 3),
  (7, 'customer-research', 'Customer research', 4),
  (7, 'promotional-strategies', 'Promotional strategies', 5),
  (7, 'marketing-for-small-businesses', 'Marketing for small businesses', 6),

  -- Communication Services (8)
  (8, 'content-creation', 'Content creation', 1),
  (8, 'writing-articles-posts', 'Writing articles and posts', 2),
  (8, 'public-relations', 'Public relations', 3),
  (8, 'business-communication', 'Business communication', 4),
  (8, 'business-messaging-management', 'Business messaging management', 5),
  (8, 'communication-strategies', 'Communication strategies', 6),

  -- Social Media Services (9)
  (9, 'social-media-management', 'Social media management', 1),
  (9, 'content-calendar-creation', 'Content calendar creation', 2),
  (9, 'social-platform-posts', 'Posts for Facebook, Instagram, and other platforms', 3),
  (9, 'digital-community-growth', 'Digital community growth', 4),
  (9, 'basic-social-media-analytics', 'Basic social media analytics', 5),

  -- Media Services (10)
  (10, 'professional-photography', 'Professional photography', 1),
  (10, 'business-property-photography', 'Business and property photography', 2),
  (10, 'video-production', 'Video production', 3),
  (10, 'video-editing', 'Video editing', 4),
  (10, 'promotional-videos', 'Promotional videos', 5),
  (10, 'event-coverage', 'Event coverage', 6),
  (10, 'audiovisual-content-social-media', 'Audiovisual content for social media', 7),

  -- Creative Design Services (11)
  (11, 'graphic-design', 'Graphic design', 1),
  (11, 'logo-design', 'Logo design', 2),
  (11, 'brand-visual-identity', 'Brand visual identity', 3),
  (11, 'flyers-promotional-materials', 'Flyers and promotional materials', 4),
  (11, 'digital-illustration', 'Digital illustration', 5),
  (11, 'professional-presentations', 'Professional presentations', 6),
  (11, 'visual-content-design', 'Visual content design', 7),

  -- Technology Services (12)
  (12, 'technical-support-businesses', 'Technical support for businesses', 1),
  (12, 'equipment-setup', 'Equipment setup', 2),
  (12, 'digital-tools', 'Digital tools', 3),
  (12, 'technology-solutions-small-businesses', 'Technology solutions for small businesses', 4),
  (12, 'basic-digital-security', 'Basic digital security', 5),
  (12, 'digital-backup', 'Digital backup', 6),

  -- Education Services (13)
  (13, 'math-tutoring', 'Math tutoring', 1),
  (13, 'science-tutoring', 'Science tutoring', 2),
  (13, 'technology-tutoring', 'Technology tutoring', 3),
  (13, 'exam-preparation', 'Exam preparation', 4),
  (13, 'academic-skills-development', 'Academic skills development', 5),
  (13, 'educational-counseling', 'Educational counseling', 6),

  -- Language Services (14)
  (14, 'english-classes', 'English classes', 1),
  (14, 'spanish-classes', 'Spanish classes', 2),
  (14, 'professional-translations', 'Professional translations', 3),
  (14, 'basic-interpretation', 'Basic interpretation', 4),
  (14, 'conversation-practice', 'Conversation practice', 5),

  -- Agriculture Services (15)
  (15, 'urban-agriculture', 'Urban agriculture', 1),
  (15, 'basic-plant-consulting', 'Basic plant consulting', 2),
  (15, 'sustainable-solutions', 'Sustainable solutions', 3),
  (15, 'agricultural-education', 'Agricultural education', 4),
  (15, 'agriculture-related-projects', 'Agriculture-related projects', 5),

  -- Landscape Services (16)
  (16, 'garden-landscape-design', 'Garden and landscape design', 1),
  (16, 'outdoor-space-planning', 'Outdoor space planning', 2),
  (16, 'sustainable-green-space-design', 'Sustainable green space design', 3),
  (16, 'plant-selection', 'Plant selection', 4),
  (16, 'exterior-improvement', 'Exterior improvement', 5),

  -- Animal Science Services (17)
  (17, 'professional-pet-care', 'Professional pet care', 1),
  (17, 'animal-care-education', 'Animal care education', 2),
  (17, 'animal-welfare', 'Animal welfare', 3),
  (17, 'basic-animal-handling', 'Basic animal handling', 4),

  -- Nutrition Services (18)
  (18, 'nutritional-education', 'Nutritional education', 1),
  (18, 'weight-loss-programs', 'Weight loss programs', 2),
  (18, 'healthy-meal-plans', 'Healthy meal plans', 3),
  (18, 'healthy-habits-guidance', 'Healthy habits guidance', 4),
  (18, 'nutrition-education', 'Nutrition education', 5),

  -- Wellness & Fitness Services (19)
  (19, 'personal-wellness-programs', 'Personal wellness programs', 1),
  (19, 'physical-activity-education', 'Physical activity education', 2),
  (19, 'basic-fitness-plans', 'Basic fitness plans', 3),
  (19, 'basic-fitness-assessment', 'Basic fitness assessment', 4),
  (19, 'healthy-habit-development', 'Healthy habit development', 5),

  -- Hospitality Services (20)
  (20, 'event-organization', 'Event organization', 1),
  (20, 'event-coordination', 'Event coordination', 2),
  (20, 'hospitality-management', 'Hospitality management', 3),
  (20, 'customer-experiences', 'Customer experiences', 4),
  (20, 'service-planning-attention', 'Service planning and attention', 5),

  -- Event Services (21)
  (21, 'event-planning', 'Event planning', 1),
  (21, 'community-activity-organization', 'Community activity organization', 2),
  (21, 'meeting-coordination', 'Meeting coordination', 3),
  (21, 'event-communication', 'Event communication', 4),
  (21, 'event-logistics-support', 'Event logistics support', 5);
