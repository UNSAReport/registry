CREATE TABLE "package_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"dependency_name" text NOT NULL,
	"version_range" text NOT NULL,
	CONSTRAINT "unique_version_dep_name" UNIQUE("version_id","dependency_name")
);
--> statement-breakpoint
CREATE TABLE "package_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"path" text NOT NULL,
	"size" integer NOT NULL,
	"checksum" text NOT NULL,
	"s3_key" text NOT NULL,
	CONSTRAINT "unique_version_path" UNIQUE("version_id","path")
);
--> statement-breakpoint
CREATE TABLE "package_tags" (
	"package_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "package_tags_package_id_tag_id_pk" PRIMARY KEY("package_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "package_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"version" text NOT NULL,
	"entry" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"s3_key" text NOT NULL,
	"archive_s3_key" text NOT NULL,
	"file_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	CONSTRAINT "unique_package_version" UNIQUE("package_id","version")
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_name" text,
	"description" text,
	"author_id" uuid NOT NULL,
	"latest_version" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "packages_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"parent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "trusted_users" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "package_dependencies" ADD CONSTRAINT "package_dependencies_version_id_package_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."package_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_files" ADD CONSTRAINT "package_files_version_id_package_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."package_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_tags" ADD CONSTRAINT "package_tags_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_tags" ADD CONSTRAINT "package_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_versions" ADD CONSTRAINT "package_versions_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."tags"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_package_dependencies_version" ON "package_dependencies" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "idx_package_files_version" ON "package_files" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "idx_package_tags_tag" ON "package_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "idx_package_versions_package" ON "package_versions" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX "idx_package_versions_status" ON "package_versions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_packages_name" ON "packages" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_packages_status" ON "packages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_packages_author" ON "packages" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "idx_tags_parent" ON "tags" USING btree ("parent_id");