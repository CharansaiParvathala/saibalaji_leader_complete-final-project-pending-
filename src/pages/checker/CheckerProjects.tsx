import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getProjects, getProgressUpdates } from '@/lib/api/api-client';
import { Project, ProgressUpdate } from '@/lib/types';
import { displayImage, revokeBlobUrl } from '@/lib/utils/image-utils';
import { useLanguage } from '@/context/language-context';

const CheckerProjects = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [progressUpdates, setProgressUpdates] = useState<ProgressUpdate[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [filteredProgress, setFilteredProgress] = useState<ProgressUpdate[]>([]);
  const [showDialog, setShowDialog] = useState<boolean>(false);
  const [selectedProgress, setSelectedProgress] = useState<ProgressUpdate | null>(null);
  const [imageUrls, setImageUrls] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(false);
  const [leaderFilter, setLeaderFilter] = useState<string>('');
  const [leaders, setLeaders] = useState<{ id: number, name: string }[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const detailsButtonRef = useRef<HTMLButtonElement | null>(null);
  const { t } = useLanguage();

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const allProjects = await getProjects();
        setProjects(allProjects);
        const uniqueLeaders: { id: number, name: string }[] = [];
        const seen = new Set();
        for (const project of allProjects) {
          if (!seen.has(project.leader_id)) {
            uniqueLeaders.push({ id: project.leader_id, name: project.leader_name || `Leader ${project.leader_id}` });
            seen.add(project.leader_id);
          }
        }
        setLeaders(uniqueLeaders);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (leaderFilter) {
      setFilteredProjects(projects.filter(p => p.leader_id === Number(leaderFilter)));
      setSelectedProject('');
      setFilteredProgress([]);
      setProgressUpdates([]);
      setImageUrls({});
    } else {
      setFilteredProjects([]);
      setSelectedProject('');
      setFilteredProgress([]);
      setProgressUpdates([]);
      setImageUrls({});
    }
  }, [projects, leaderFilter]);

  useEffect(() => {
    const fetchProgress = async () => {
      if (leaderFilter && selectedProject) {
        setLoading(true);
        try {
          const updates = await getProgressUpdates(Number(selectedProject));
          setProgressUpdates(updates);
          setFilteredProgress(updates);
          await loadImagesForProgress(updates);
        } catch (error) {
          console.error('Error loading progress:', error);
        } finally {
          setLoading(false);
        }
      } else {
        setProgressUpdates([]);
        setFilteredProgress([]);
        setImageUrls({});
      }
    };
    fetchProgress();
  }, [leaderFilter, selectedProject]);

  useEffect(() => {
    if (statusFilter === 'all') {
      setFilteredProgress(progressUpdates);
    } else {
      setFilteredProgress(progressUpdates.filter(p => p.status === statusFilter));
    }
  }, [statusFilter, progressUpdates]);

  const loadImagesForProgress = async (updates: ProgressUpdate[]) => {
    const newImageUrls: { [key: string]: string } = {};
    for (const update of updates) {
      if (update.image_ids && update.image_ids.length > 0) {
        for (const imageId of update.image_ids) {
          const key = `${update.id}-${imageId}`;
          try {
            const imageUrl = await displayImage(imageId, 'progress');
            newImageUrls[key] = imageUrl;
          } catch (error) {
            console.error(`Error loading image ${imageId}:`, error);
          }
        }
      }
    }
    setImageUrls(newImageUrls);
  };

  const handleLeaderChange = (leaderId: string) => {
    setLeaderFilter(leaderId);
  };

  const handleProjectChange = (projectId: string) => {
    setSelectedProject(projectId);
  };

  const handleViewProgress = (progress: ProgressUpdate, event?: React.MouseEvent<HTMLButtonElement>) => {
    setSelectedProgress(progress);
    setShowDialog(true);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const calculateCompletionPercentage = (projectId: string) => {
    const project = projects.find(p => p.id === Number(projectId));
    if (!project || project.total_work === 0) return 0;
    return Math.min(100, Math.round((project.completed_work / project.total_work) * 100));
  };

  useEffect(() => {
    return () => {
      Object.values(imageUrls).forEach(url => {
        revokeBlobUrl(url);
      });
    };
  }, [imageUrls]);

  useEffect(() => {
    if (showDialog) {
      window.scrollTo(0, 0);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showDialog]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-4xl font-bold mb-6">{t('app.checker.projects.title')}</h1>
      <p className="text-muted-foreground mb-8">
        {t('app.checker.projects.description')}
      </p>
      <div className="mb-6 max-w-md grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="leader">{t('app.checker.projects.leader')}</Label>
          <select
            className="w-full p-2 border rounded bg-white dark:bg-[#23272f] dark:text-white"
            value={leaderFilter}
            onChange={e => handleLeaderChange(e.target.value)}
          >
            <option value="" disabled>{t('app.checker.projects.selectLeader')}</option>
              {leaders.map(l => (
              <option key={l.id} value={l.id.toString()}>{l.name}</option>
              ))}
          </select>
        </div>
        <div>
          <Label htmlFor="project">{t('app.checker.projects.project')}</Label>
          <select
            className="w-full p-2 border rounded bg-white dark:bg-[#23272f] dark:text-white"
            value={selectedProject}
            onChange={e => handleProjectChange(e.target.value)}
            disabled={filteredProjects.length === 0}
          >
            <option value="" disabled>{t('app.checker.projects.selectProject')}</option>
              {filteredProjects.map(p => (
              <option key={p.id} value={p.id.toString()}>{p.title}</option>
              ))}
          </select>
        </div>
        <div>
          <Label htmlFor="status">{t('app.checker.projects.status')}</Label>
          <select
            className="w-full p-2 border rounded bg-white dark:bg-[#23272f] dark:text-white"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="all">{t('app.checker.projects.allStatuses')}</option>
            <option value="completed">{t('app.checker.projects.completed')}</option>
            <option value="pending">{t('app.checker.projects.pending')}</option>
          </select>
        </div>
      </div>
      {leaderFilter && selectedProject && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
          {filteredProgress.map(progress => (
            <Card key={progress.id}>
              <CardHeader>
                <CardTitle>{projects.find(p => p.id === progress.project_id)?.title || t('app.checker.projects.project')}</CardTitle>
                <CardDescription>{formatDate(progress.created_at)}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {/* Vehicle and Driver Details */}
                  {progress.vehicle && (
                    <div className="mb-2">
                      <div className="font-semibold text-lg">{progress.vehicle.model} <span className="text-sm text-muted-foreground">({progress.vehicle.type})</span></div>
                      {progress.driver_external ? (
                        <div className="text-base">{progress.driver_external.name} <span className="italic text-xs">({t('app.checker.projects.externalDriver')})</span></div>
                      ) : progress.driver ? (
                        <div className="text-base">{progress.driver.name}</div>
                      ) : null}
                    </div>
                  )}
                  {/* Meter Images */}
                  {(progress.start_meter_image_id || progress.end_meter_image_id) && (
                    <div className="mb-2">
                      {progress.start_meter_image_id && (
                        <div className="mb-1">
                          <div className="text-base font-semibold">{t('app.checker.projects.startMeter')}</div>
                          <img
                            src={imageUrls[`${progress.id}-${progress.start_meter_image_id}`]}
                            alt={t('app.checker.projects.startMeter')}
                            className="w-32 h-20 object-cover rounded border"
                            onError={e => (e.currentTarget.style.display = 'none')}
                          />
                        </div>
                      )}
                      {progress.end_meter_image_id && (
                        <div>
                          <div className="text-base font-semibold">{t('app.checker.projects.endMeter')}</div>
                          <img
                            src={imageUrls[`${progress.id}-${progress.end_meter_image_id}`]}
                            alt={t('app.checker.projects.endMeter')}
                            className="w-32 h-20 object-cover rounded border"
                            onError={e => (e.currentTarget.style.display = 'none')}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  {/* Progress Images with subheading, excluding meter images */}
                  {progress.image_ids && progress.image_ids.filter(id => id !== progress.start_meter_image_id && id !== progress.end_meter_image_id).length > 0 && (
                    <div className="mt-4">
                      <div className="font-semibold text-lg mb-2">{t('app.checker.projects.progressImages')}</div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {progress.image_ids.filter(id => id !== progress.start_meter_image_id && id !== progress.end_meter_image_id).map((imageId, index) => {
                          const imageKey = `${progress.id}-${imageId}`;
                          const imageUrl = imageUrls[imageKey];
                          return imageUrl ? (
                            <div key={index} className="relative">
                              <img
                                src={imageUrl}
                                alt={`${t('app.checker.projects.progressPhoto')} ${index + 1}`}
                                className="w-full h-40 object-cover rounded-lg"
                                onError={e => (e.target.style.display = 'none')}
                              />
                            </div>
                          ) : (
                            <div key={index} className="relative">
                              <div className="w-full h-56 bg-muted rounded-lg flex items-center justify-center">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {/* Remark/Note with subheading */}
                  {progress.description && (
                    <div className="mt-4">
                      <div className="font-semibold text-lg mb-2">{t('app.checker.projects.remark')}</div>
                      <div className="text-base text-muted-foreground">{progress.description}</div>
                    </div>
                  )}
                  <div className="flex justify-between mb-1 mt-4">
                    <span>{t('app.checker.projects.completion')}</span>
                    <span>{calculateCompletionPercentage(progress.project_id.toString())}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2.5">
                    <div 
                      className="bg-primary h-2.5 rounded-full" 
                      style={{ width: `${calculateCompletionPercentage(progress.project_id.toString())}%` }}
                    ></div>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                {/* Removed View Details button as per request */}
              </CardFooter>
            </Card>
          ))}
          {filteredProgress.length === 0 && (
            <Card className="col-span-full">
              <CardHeader>
                <CardTitle>{t('app.checker.projects.noProgressFound')}</CardTitle>
                <CardDescription>
                  {t('app.checker.projects.noProgressMatch')}
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      )}
      {(leaderFilter && !selectedProject) && (
        <div className="text-center text-muted-foreground py-12">{t('app.checker.projects.selectLeaderAndProject')}</div>
      )}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-xl w-full max-h-[90vh] bg-white dark:bg-[#23272f] dark:text-white" position="center" style={{position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 9999}}>
          <div className="overflow-y-auto max-h-[75vh]">
            <DialogHeader>
              <DialogTitle>{t('app.checker.projects.progressDetails')}</DialogTitle>
              <DialogDescription>
                {selectedProgress && formatDate(selectedProgress.created_at)}
              </DialogDescription>
            </DialogHeader>
            {selectedProgress && (
              <div className="space-y-4">
                <div className="text-lg font-semibold">
                  {projects.find(p => p.id === selectedProgress.project_id)?.title}
                </div>
                {/* Vehicle and Driver Details */}
                {selectedProgress.vehicle && (
                  <div className="mb-2">
                    <div className="font-semibold text-lg">{selectedProgress.vehicle.model} <span className="text-sm text-muted-foreground">({selectedProgress.vehicle.type})</span></div>
                    {selectedProgress.driver_external ? (
                      <div className="text-base">{selectedProgress.driver_external.name} <span className="italic text-xs">({t('app.checker.projects.externalDriver')})</span></div>
                    ) : selectedProgress.driver ? (
                      <div className="text-base">{selectedProgress.driver.name}</div>
                    ) : null}
                  </div>
                )}
                {/* Meter Images */}
                {(selectedProgress.start_meter_image_id || selectedProgress.end_meter_image_id) && (
                  <div className="mb-2">
                    {selectedProgress.start_meter_image_id && (
                      <div className="mb-1">
                        <div className="text-base font-semibold">{t('app.checker.projects.startMeter')}</div>
                        <img
                          src={imageUrls[`${selectedProgress.id}-${selectedProgress.start_meter_image_id}`]}
                          alt={t('app.checker.projects.startMeter')}
                          className="w-32 h-20 object-cover rounded border"
                          onError={e => (e.currentTarget.style.display = 'none')}
                        />
                      </div>
                    )}
                    {selectedProgress.end_meter_image_id && (
                      <div>
                        <div className="text-base font-semibold">{t('app.checker.projects.endMeter')}</div>
                        <img
                          src={imageUrls[`${selectedProgress.id}-${selectedProgress.end_meter_image_id}`]}
                          alt={t('app.checker.projects.endMeter')}
                          className="w-32 h-20 object-cover rounded border"
                          onError={e => (e.currentTarget.style.display = 'none')}
                        />
                      </div>
                    )}
                  </div>
                )}
                {/* Progress Images with subheading, excluding meter images */}
                {selectedProgress.image_ids && selectedProgress.image_ids.filter(id => id !== selectedProgress.start_meter_image_id && id !== selectedProgress.end_meter_image_id).length > 0 && (
                  <div className="mt-4">
                    <div className="font-semibold text-lg mb-2">{t('app.checker.projects.progressImages')}</div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {selectedProgress.image_ids.filter(id => id !== selectedProgress.start_meter_image_id && id !== selectedProgress.end_meter_image_id).map((imageId, index) => {
                        const imageKey = `${selectedProgress.id}-${imageId}`;
                        const imageUrl = imageUrls[imageKey];
                        return imageUrl ? (
                          <div key={index} className="relative">
                            <img
                              src={imageUrl}
                              alt={`${t('app.checker.projects.progressPhoto')} ${index + 1}`}
                              className="w-full h-40 object-cover rounded-lg"
                              onError={e => (e.target.style.display = 'none')}
                            />
                          </div>
                        ) : (
                          <div key={index} className="relative">
                            <div className="w-full h-56 bg-muted rounded-lg flex items-center justify-center">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* Remark/Note with subheading */}
                {selectedProgress.description && (
                  <div className="mt-4">
                    <div className="font-semibold text-lg mb-2">{t('app.checker.projects.remark')}</div>
                    <div className="text-base text-muted-foreground">{selectedProgress.description}</div>
                  </div>
                )}
                <div className="flex justify-between mb-1 mt-4">
                  <span>{t('app.checker.projects.completion')}</span>
                  <span>{calculateCompletionPercentage(selectedProgress.project_id.toString())}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2.5">
                  <div 
                    className="bg-primary h-2.5 rounded-full" 
                    style={{ width: `${calculateCompletionPercentage(selectedProgress.project_id.toString())}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CheckerProjects;
