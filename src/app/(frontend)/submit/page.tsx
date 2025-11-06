"use client";

import { useState } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, AlertCircle, Send, Rocket } from "lucide-react";
import Link from "next/link";

export default function SubmitPage() {
	const [formData, setFormData] = useState({
		name: "",
		website: "",
		shortDescription: "",
		category: "Infrastructure",
	});
	const [loading, setLoading] = useState(false);
	const [success, setSuccess] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setError(null);

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
					setError(
						`Validation errors: ${data.details
							.map((d: { message: string }) => d.message)
							.join(", ")}`,
					);
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
			});
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
			<div className="container mx-auto px-6 py-16 max-w-2xl">
				<Card className="border-2 border-green-500/20 bg-gradient-to-br from-green-500/10 to-transparent shadow-2xl">
					<CardHeader className="text-center space-y-4">
						<div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-500/20">
							<CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
						</div>
						<CardTitle className="text-3xl">Thank You!</CardTitle>
						<CardDescription className="text-base">
							Your project submission has been received and is pending review.
						</CardDescription>
					</CardHeader>
					<CardContent className="text-center space-y-6">
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
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="container mx-auto px-6 py-12 max-w-2xl">
			<div className="mb-8 space-y-4">
				<div className="flex items-center gap-3">
					<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/10">
						<Rocket className="h-6 w-6 text-primary" />
					</div>
					<div>
						<h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
							Submit a Project
						</h1>
						<p className="mt-2 text-lg text-muted-foreground">
							Share your Stellar ecosystem project to be included in the
							directory
						</p>
					</div>
				</div>
			</div>

			<Card className="border-2 shadow-xl">
				<CardHeader className="space-y-2">
					<CardTitle className="text-2xl">Project Information</CardTitle>
					<CardDescription>
						Fill out the form below to submit your project for review
					</CardDescription>
				</CardHeader>
				<CardContent>
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
								onChange={(e) =>
									setFormData({ ...formData, name: e.target.value })
								}
								placeholder="e.g., StellarX Wallet"
								className="h-12 text-base border-2 focus:border-primary/50"
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="website" className="text-base font-semibold">
								Website URL
							</Label>
							<Input
								id="website"
								type="url"
								value={formData.website}
								onChange={(e) =>
									setFormData({ ...formData, website: e.target.value })
								}
								placeholder="https://example.com"
								className="h-12 text-base border-2 focus:border-primary/50"
							/>
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
								onChange={(e) =>
									setFormData({
										...formData,
										shortDescription: e.target.value,
									})
								}
								placeholder="Brief description of your project..."
								className="text-base border-2 focus:border-primary/50 resize-none"
							/>
							<p className="text-xs text-muted-foreground">
								Minimum 10 characters, maximum 1000 characters
							</p>
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
							<p className="text-xs text-muted-foreground">
								Projects submitted from this form will be set to Draft status and
								require admin approval before appearing on the frontend.
							</p>
						</div>

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
				</CardContent>
			</Card>
		</div>
	);
}
