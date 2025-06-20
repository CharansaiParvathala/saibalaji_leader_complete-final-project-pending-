import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import { Upload, Clock, CheckCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useNavigate } from 'react-router-dom';
import { 
  getProjects, 
  startFinalSubmissionTimer, 
  uploadFinalSubmissionImages, 
  completeFinalSubmission,
  getTimerStatus,
  getFinalSubmissions,
  getFinalSubmissionDetails
} from '@/lib/api/api-client';
import { Project, PhotoWithMetadata } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

const LeaderFinalSubmission = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [notes, setNotes] = useState<string>('');
  const [completionPhotos, setCompletionPhotos] = useState<PhotoWithMetadata[]>([]);
  const [timerActive, setTimerActive] = useState<boolean>(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(600); // 10 minutes in seconds
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [currentSubmissionId, setCurrentSubmissionId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [timerResumed, setTimerResumed] = useState<boolean>(false);

  useEffect(() => {
    if (user) {
      loadProjects();
    }
  }, [user]);

  const loadProjects = async () => {
    try {
      setIsLoading(true);
      const allProjects = await getProjects();
      // Filter only completed projects (100% work done)
      const completedProjects = allProjects.filter(project => 
        project.completed_work >= project.total_work
      );
      setProjects(completedProjects);
      
      if (completedProjects.length > 0) {
        setSelectedProject(completedProjects[0].id);
        
        // Check for active timers across all completed projects
        await checkForActiveTimersAcrossProjects(completedProjects);
      }
    } catch (error) {
      console.error('Error loading projects:', error);
      toast.error('Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  };

  const checkForActiveTimersAcrossProjects = async (projects: Project[]) => {
    try {
      for (const project of projects) {
        const submissions = await getFinalSubmissions(project.id);
        const activeSubmission = submissions.find(sub => sub.status === 'in_progress');
        
        if (activeSubmission) {
          console.log('Found active timer for project:', project.id);
          setSelectedProject(project.id);
          setCurrentSubmissionId(activeSubmission.id);
          setTimerActive(true);
          
          // Get current timer status
          const timerStatus = await getTimerStatus(activeSubmission.id);
          setTimeRemaining(timerStatus.timeRemaining);
          
          // Load existing images for this submission
          await loadSubmissionImages(activeSubmission.id);
          
          setTimerResumed(true);
          toast.success(`Resumed active timer for project: ${project.title}`);
          break; // Found an active timer, no need to check other projects
        }
      }
    } catch (error) {
      console.error('Error checking for active timers:', error);
    }
  };

  const loadSubmissionImages = async (submissionId: number) => {
    try {
      const submissionDetails = await getFinalSubmissionDetails(submissionId);
      if (submissionDetails.images && submissionDetails.images.length > 0) {
        const photos: PhotoWithMetadata[] = submissionDetails.images.map((img: any) => ({
          dataUrl: img.dataUrl,
          timestamp: img.timestamp,
          location: { latitude: 0, longitude: 0 }
        }));
        setCompletionPhotos(photos);
      }
    } catch (error) {
      console.error('Error loading submission images:', error);
    }
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    if (timerActive && currentSubmissionId) {
      timer = setInterval(async () => {
        try {
          // Check timer status from server
          const timerStatus = await getTimerStatus(currentSubmissionId);
          
          if (timerStatus.status === 'expired') {
            setTimerActive(false);
            setTimeRemaining(0);
            toast.error("Time's up! You can no longer upload completion photos.");
            return;
          }
          
          setTimeRemaining(timerStatus.timeRemaining);
          
          if (timerStatus.timeRemaining <= 0) {
            setTimerActive(false);
            toast.error("Time's up! You can no longer upload completion photos.");
          }
        } catch (error) {
          console.error('Error checking timer status:', error);
        }
      }, 1000);
    }

    return () => {
      clearInterval(timer);
    };
  }, [timerActive, currentSubmissionId]);

  const startCompletionTimer = async () => {
    if (!selectedProject || !user) {
      toast.error("Please select a project");
      return;
    }

    try {
      const response = await startFinalSubmissionTimer(selectedProject, parseInt(user.id));
      setCurrentSubmissionId(response.submissionId);
      setTimerActive(true);
      setTimeRemaining(response.timerDuration);
      setTimerResumed(false);
      toast.success("You have 10 minutes to upload completion photos");
    } catch (error) {
      console.error('Error starting timer:', error);
      toast.error('Failed to start timer. Please try again.');
    }
  };

  const handleCompletionPhotoUpload = async () => {
    if (!timerActive || !currentSubmissionId) {
      toast.error("Please start the timer first to upload completion photos");
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) {
        try {
          const imagePromises = Array.from(files).map(file => {
            return new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => {
                const result = reader.result as string;
                // Convert to base64 without data URL prefix
                const base64 = result.split(',')[1];
                resolve(base64);
              };
              reader.readAsDataURL(file);
            });
          });

          const base64Images = await Promise.all(imagePromises);
          
          // Upload images to server
          const uploadResponse = await uploadFinalSubmissionImages(currentSubmissionId, base64Images);
          
          // Reload images from server to get the updated list
          await loadSubmissionImages(currentSubmissionId);

          toast.success(`Uploaded ${uploadResponse.uploadedCount} images successfully`);
        } catch (error) {
          console.error('Error uploading images:', error);
          toast.error('Failed to upload images. Please try again.');
        }
      }
    };
    input.click();
  };

  const handleRemoveCompletionPhoto = async (index: number) => {
    // For now, we'll just remove from local state
    // In a full implementation, you'd want to add a delete endpoint to remove from server
    setCompletionPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!currentSubmissionId || !user) {
      toast.error("Please start the timer first");
      return;
    }

    if (completionPhotos.length === 0) {
      toast.error("Please upload at least one completion photo");
      return;
    }

    if (timerActive) {
      toast.error("Please wait for the timer to finish before submitting");
      return;
    }

    setIsSubmitting(true);

    try {
      await completeFinalSubmission(currentSubmissionId, notes);
      toast.success("Final project submission completed successfully");
      
      // Redirect to dashboard after short delay
      setTimeout(() => {
        navigate('/leader');
      }, 1500);
    } catch (error) {
      console.error("Error submitting final project:", error);
      toast.error("Failed to submit final project. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardContent className="flex items-center justify-center p-8">
            <div>Loading projects...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle>No Completed Projects</CardTitle>
            <CardDescription>
              You don't have any completed projects to submit final images for.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/leader')} className="w-full">
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-4xl font-bold mb-6">Final Project Submission</h1>
      <p className="text-muted-foreground mb-8">
        Upload final project images for completed projects
      </p>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Project Selection</CardTitle>
            <CardDescription>
              Select a completed project to upload final images
            </CardDescription>
          </CardHeader>
          <CardContent>
            <select
              value={selectedProject || ''}
              onChange={async (e) => {
                const newProjectId = parseInt(e.target.value);
                setSelectedProject(newProjectId);
                
                // Reset timer state when changing projects
                setTimerActive(false);
                setTimeRemaining(600);
                setCurrentSubmissionId(null);
                setCompletionPhotos([]);
                setTimerResumed(false);
                
                // Check if there's an active timer for the new project
                await checkForActiveTimersAcrossProjects(projects.filter(p => p.id === newProjectId));
              }}
              className="w-full p-2 border rounded"
              disabled={timerActive}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title} - {project.completed_work}/{project.total_work} completed
                </option>
              ))}
            </select>
          </CardContent>
        </Card>

        {selectedProject && !timerActive && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CheckCircle className="mr-2 h-5 w-5 text-green-500" />
                Ready to Upload Final Images
              </CardTitle>
              <CardDescription>
                You'll have 10 minutes to upload multiple images for this project
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={startCompletionTimer} className="w-full">
                Start Photo Upload Timer
              </Button>
            </CardContent>
          </Card>
        )}

        {timerActive && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock className="mr-2 h-5 w-5" />
                Time Remaining: {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
                {timerResumed && (
                  <Badge className="ml-2 bg-blue-100 text-blue-800 border-blue-300">
                    Resumed
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Upload final project images before time runs out
                {timerResumed && " - Timer resumed from previous session"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Progress value={(timeRemaining / 600) * 100} className="w-full" />
                <Button onClick={handleCompletionPhotoUpload} className="w-full">
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Final Project Images
                </Button>
                {completionPhotos.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {completionPhotos.map((photo, index) => (
                      <div key={index} className="relative">
                        <img
                          src={photo.dataUrl}
                          alt={`Final project photo ${index + 1}`}
                          className="w-full h-32 object-cover rounded"
                        />
                        <button
                          onClick={() => handleRemoveCompletionPhoto(index)}
                          className="absolute top-1 right-1 bg-black/70 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                          type="button"
                        >
                          ×
                        </button>
                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-1">
                          {new Date(photo.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Additional Notes</CardTitle>
            <CardDescription>
              Add any additional notes about the final project submission
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Enter any additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[100px]"
            />
          </CardContent>
          <CardFooter>
            <Button 
              onClick={handleSubmit} 
              className="w-full"
              disabled={isSubmitting || timerActive || completionPhotos.length === 0}
            >
              {isSubmitting ? "Submitting..." : "Submit Final Project"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default LeaderFinalSubmission;
