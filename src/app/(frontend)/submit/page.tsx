"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	CheckCircle2,
	AlertCircle,
	Send,
	Info,
	ArrowLeft,
	Plus,
	X,
	Github,
} from "lucide-react";
import Link from "next/link";

export default function SubmitPage() {
	const [formData, setFormData] = useState({
		name: "",
		website: "",
		shortDescription: "",
		category: "Infrastructure",
		github: {
			orgLogin: "",
			repos: [] as Array<{ owner: string; name: string }>,
		},
	});
	const [loading, setLoading] = useState(false);
	const [success, setSuccess] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
	const [successMessage, setSuccessMessage] = useState<string | null>(null);
	const [newRepo, setNewRepo] = useState({ owner: "", name: "" });

	const descriptionLength = formData.shortDescription.length;
	const descriptionMin = 10;
	const descriptionMax = 1000;
	const isDescriptionValid =
		descriptionLength === 0 ||
		(descriptionLength >= descriptionMin && descriptionLength <= descriptionMax);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setError(null);
		setFieldErrors({});

		// Client-side validation
		const errors: Record<string, string> = {};

		if (!formData.name.trim()) {
			errors.name = "Project name is required";
		}

		if (formData.shortDescription.trim().length < descriptionMin) {
			errors.shortDescription = `Description must be at least ${descriptionMin} characters`;
		}

		if (formData.shortDescription.length > descriptionMax) {
			errors.shortDescription = `Description must be no more than ${descriptionMax} characters`;
		}

		if (formData.website && formData.website.trim()) {
			try {
				new URL(formData.website.trim());
			} catch {
				errors.website = "Please enter a valid URL (e.g., https://example.com)";
			}
		}

		// Validate GitHub repos
		formData.github.repos.forEach((repo, index) => {
			if (!repo.owner.trim()) {
				errors[`github.repos.${index}.owner`] =
					"Repository owner is required";
			}
			if (!repo.name.trim()) {
				errors[`github.repos.${index}.name`] = "Repository name is required";
			}
		});

		if (Object.keys(errors).length > 0) {
			setFieldErrors(errors);
			setLoading(false);
			return;
		}

		try {
			const response = await fetch("/api/intake", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					...formData,
					website: formData.website.trim() || undefined,
				}),
			});

			const data = await response.json();

			if (!response.ok) {
				if (data.details) {
					// Parse Zod validation errors
					const zodErrors: Record<string, string> = {};
					data.details.forEach((detail: { path: string[]; message: string }) => {
						if (detail.path.length > 0) {
							zodErrors[detail.path[0]] = detail.message;
						}
					});
					if (Object.keys(zodErrors).length > 0) {
						setFieldErrors(zodErrors);
					} else {
						setError(
							`Validation errors: ${data.details
								.map((d: { message: string }) => d.message)
								.join(", ")}`,
						);
					}
				} else {
					setError(data.message || data.error || "Failed to submit project");
				}
				setLoading(false);
				return;
			}

			setSuccessMessage(data.message || null);
			setSuccess(true);
			setFormData({
				name: "",
				website: "",
				shortDescription: "",
				category: "Infrastructure",
				github: {
					orgLogin: "",
					repos: [],
				},
			});
			setNewRepo({ owner: "", name: "" });
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "An unexpected error occurred",
			);
		} finally {
			setLoading(false);
		}
	};

	if (success) {
		return (
			<div className="min-h-screen relative">
				<main className="max-w-6xl mx-auto px-4 sm:px-6 py-12 pt-24">
					<div className="max-w-2xl mx-auto">
						<div className="idea-card rounded-xl p-8 border-2 border-green-500/20 bg-gradient-to-br from-green-500/10 to-transparent">
							<div className="text-center space-y-6">
								<div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-500/20">
									<CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
								</div>
								<div>
									<h1 className="text-3xl font-bold tracking-tight mb-3">
										Thank You!
									</h1>
									<p className="text-lg text-muted-foreground">
										Your project submission has been received and is pending review.
									</p>
								</div>
								<p className="text-sm text-muted-foreground">
									{successMessage ||
										"Your project has been submitted and is pending admin approval. Once approved, it will appear in the public directory."}
								</p>
								<div className="flex flex-col gap-3 sm:flex-row sm:justify-center pt-4">
									<Button asChild size="lg" className="px-8">
										<Link href="/directory">Browse Directory</Link>
									</Button>
									<Button
										variant="outline"
										size="lg"
										className="px-8"
										onClick={() => setSuccess(false)}
									>
										Submit Another
									</Button>
								</div>
							</div>
						</div>
					</div>
				</main>
			</div>
		);
	}

	return (
		<div className="min-h-screen relative">
			<main className="max-w-6xl mx-auto px-4 sm:px-6 py-12 pt-24">
				<div className="max-w-2xl mx-auto">
					<Button asChild variant="ghost" className="mb-8">
						<Link href="/directory">
							<ArrowLeft className="mr-2 h-4 w-4" />
							Back to Directory
						</Link>
					</Button>

					<div className="mb-8">
						<h2 className="text-3xl font-medium tracking-tight mb-3">
							Submit a Project
						</h2>
						<p className="text-lg text-muted-foreground">
							Share your Stellar ecosystem project to be included in the directory
						</p>
					</div>

					<div className="idea-card rounded-xl p-6 border-2">
					<div className="mb-6 space-y-2">
						<h3 className="text-2xl font-semibold">Project Information</h3>
						<p className="text-sm text-muted-foreground">
							Fill out the form below to submit your project for review
						</p>
					</div>
					<div>
					<form onSubmit={handleSubmit} className="space-y-6">
						<div className="space-y-2">
							<Label htmlFor="name" className="text-base font-semibold">
								Project Name <span className="text-destructive">*</span>
							</Label>
							<Input
								id="name"
								type="text"
								required
								value={formData.name}
								onChange={(e) => {
									setFormData({ ...formData, name: e.target.value });
									if (fieldErrors.name) {
										setFieldErrors({ ...fieldErrors, name: "" });
									}
								}}
								placeholder="e.g., StellarX Wallet"
								className={`h-12 text-base border-2 ${
									fieldErrors.name
										? "border-destructive focus:border-destructive"
										: "focus:border-primary/50"
								}`}
								aria-invalid={!!fieldErrors.name}
								aria-describedby={fieldErrors.name ? "name-error" : undefined}
							/>
							{fieldErrors.name && (
								<p
									id="name-error"
									className="text-sm text-destructive flex items-center gap-1"
								>
									<AlertCircle className="h-3.5 w-3.5" />
									{fieldErrors.name}
								</p>
							)}
						</div>

						<div className="space-y-2">
							<Label htmlFor="website" className="text-base font-semibold">
								Website URL
							</Label>
							<Input
								id="website"
								type="url"
								value={formData.website}
								onChange={(e) => {
									setFormData({ ...formData, website: e.target.value });
									if (fieldErrors.website) {
										setFieldErrors({ ...fieldErrors, website: "" });
									}
								}}
								placeholder="https://example.com"
								className={`h-12 text-base border-2 ${
									fieldErrors.website
										? "border-destructive focus:border-destructive"
										: "focus:border-primary/50"
								}`}
								aria-invalid={!!fieldErrors.website}
								aria-describedby={
									fieldErrors.website ? "website-error" : undefined
								}
							/>
							{fieldErrors.website && (
								<p
									id="website-error"
									className="text-sm text-destructive flex items-center gap-1"
								>
									<AlertCircle className="h-3.5 w-3.5" />
									{fieldErrors.website}
								</p>
							)}
							<p className="text-xs text-muted-foreground">
								Optional. Include your project's main website URL.
							</p>
						</div>

						<div className="space-y-2">
							<Label
								htmlFor="shortDescription"
								className="text-base font-semibold"
							>
								Description <span className="text-destructive">*</span>
							</Label>
							<Textarea
								id="shortDescription"
								required
								rows={6}
								value={formData.shortDescription}
								onChange={(e) => {
									setFormData({
										...formData,
										shortDescription: e.target.value,
									});
									if (fieldErrors.shortDescription) {
										setFieldErrors({
											...fieldErrors,
											shortDescription: "",
										});
									}
								}}
								placeholder="Brief description of your project..."
								className={`text-base border-2 resize-none ${
									fieldErrors.shortDescription
										? "border-destructive focus:border-destructive"
										: "focus:border-primary/50"
								}`}
								aria-invalid={!!fieldErrors.shortDescription}
								aria-describedby={
									fieldErrors.shortDescription
										? "description-error"
										: "description-help"
								}
							/>
							<div className="flex items-center justify-between">
								<div>
									{fieldErrors.shortDescription && (
										<p
											id="description-error"
											className="text-sm text-destructive flex items-center gap-1"
										>
											<AlertCircle className="h-3.5 w-3.5" />
											{fieldErrors.shortDescription}
										</p>
									)}
									<p
										id="description-help"
										className={`text-xs ${
											fieldErrors.shortDescription
												? "text-destructive"
												: "text-muted-foreground"
										}`}
									>
										Minimum {descriptionMin} characters, maximum{" "}
										{descriptionMax} characters
									</p>
								</div>
								<span
									className={`text-xs font-medium ${
										descriptionLength > descriptionMax
											? "text-destructive"
											: descriptionLength >= descriptionMin
												? "text-green-600 dark:text-green-400"
												: "text-muted-foreground"
									}`}
								>
									{descriptionLength}/{descriptionMax}
								</span>
							</div>
						</div>

						<div className="space-y-2">
							<Label htmlFor="category" className="text-base font-semibold">
								Category <span className="text-destructive">*</span>
							</Label>
							<Select
								id="category"
								required
								value={formData.category}
								onChange={(e) =>
									setFormData({ ...formData, category: e.target.value })
								}
								className="h-12 text-base border-2 focus:border-primary/50"
							>
								<option value="Infrastructure">Infrastructure</option>
								<option value="Tooling">Tooling</option>
								<option value="Partner Integration">
									Partner Integration
								</option>
								<option value="User-Facing App">User-Facing App</option>
								<option value="Asset">Asset</option>
								<option value="Protocol/Contract">Protocol/Contract</option>
								<option value="Anchor">Anchor</option>
							</Select>
						</div>

						<div className="space-y-4 pt-4 border-t border-border">
							<div className="flex items-center gap-2">
								<Github className="h-5 w-5 text-muted-foreground" />
								<h3 className="text-lg font-semibold">GitHub Repositories</h3>
							</div>
							<p className="text-sm text-muted-foreground">
								Optionally link GitHub repositories to automatically display
								activity and issue metrics.
							</p>

							<div className="space-y-2">
								<Label htmlFor="githubOrg" className="text-base font-semibold">
									GitHub Organization (Optional)
								</Label>
								<Input
									id="githubOrg"
									type="text"
									value={formData.github.orgLogin}
									onChange={(e) =>
										setFormData({
											...formData,
											github: {
												...formData.github,
												orgLogin: e.target.value,
											},
										})
									}
									placeholder="e.g., stellar"
									className="h-12 text-base border-2 focus:border-primary/50"
								/>
								<p className="text-xs text-muted-foreground">
									Organization login (e.g., "stellar" for github.com/stellar)
								</p>
							</div>

							<div className="space-y-3">
								<Label className="text-base font-semibold">
									Repositories
								</Label>

								{formData.github.repos.length > 0 && (
									<div className="space-y-2">
										{formData.github.repos.map((repo, index) => (
											<div
												key={index}
												className="flex items-center gap-2 p-3 rounded-lg border-2 bg-muted/30"
											>
												<div className="flex-1">
													<span className="text-sm font-medium">
														{repo.owner}/{repo.name}
													</span>
												</div>
												<Button
													type="button"
													variant="ghost"
													size="sm"
													onClick={() => {
														const newRepos = formData.github.repos.filter(
															(_, i) => i !== index,
														);
														setFormData({
															...formData,
															github: {
																...formData.github,
																repos: newRepos,
															},
														});
													}}
													className="h-8 w-8 p-0"
												>
													<X className="h-4 w-4" />
												</Button>
											</div>
										))}
									</div>
								)}

								<div className="flex gap-2">
									<Input
										type="text"
										placeholder="Owner (e.g., stellar)"
										value={newRepo.owner}
										onChange={(e) =>
											setNewRepo({ ...newRepo, owner: e.target.value })
										}
										className="flex-1 h-10 text-sm border-2"
									/>
									<span className="self-center text-muted-foreground">/</span>
									<Input
										type="text"
										placeholder="Repo name (e.g., js-stellar-sdk)"
										value={newRepo.name}
										onChange={(e) =>
											setNewRepo({ ...newRepo, name: e.target.value })
										}
										className="flex-1 h-10 text-sm border-2"
									/>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => {
											if (newRepo.owner.trim() && newRepo.name.trim()) {
												setFormData({
													...formData,
													github: {
														...formData.github,
														repos: [
															...formData.github.repos,
															{
																owner: newRepo.owner.trim(),
																name: newRepo.name.trim(),
															},
														],
													},
												});
												setNewRepo({ owner: "", name: "" });
											}
										}}
										className="h-10 px-4"
										disabled={
											!newRepo.owner.trim() || !newRepo.name.trim()
										}
									>
										<Plus className="h-4 w-4 mr-1" />
										Add
									</Button>
								</div>
								<p className="text-xs text-muted-foreground">
									Add repositories using the format: owner/repo-name
								</p>
							</div>
						</div>

						<Alert className="border-2 border-blue-500/20 bg-blue-500/10">
							<Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
							<AlertDescription className="text-sm">
								<strong>Important:</strong> Projects submitted from this form will
								be set to Draft status and require admin approval before appearing
								in the public directory. You'll be notified once your project has
								been reviewed.
							</AlertDescription>
						</Alert>

						{error && (
							<Alert variant="destructive" className="border-2">
								<AlertCircle className="h-4 w-4" />
								<AlertDescription className="font-medium">
									{error}
								</AlertDescription>
							</Alert>
						)}

						<Button
							type="submit"
							disabled={loading}
							className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20 hover:shadow-xl"
							size="lg"
						>
							{loading ? (
								<>Submitting...</>
							) : (
								<>
									<Send className="mr-2 h-5 w-5" />
									Submit Project
								</>
							)}
						</Button>
					</form>
					</div>
				</div>
			</div>
		</main>
		</div>
	);
}
