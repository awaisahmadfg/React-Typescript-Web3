async function generateVideo(
  item,
  itemId,
  itemType,
  audioBlob,
  user,
  creditsHistory,
) {
  try {
    const backendRoot = findBackendTempDirectory();
    const videoPrompt = await generatePrompt(item, itemType);

    const watermarkTexts = {
      [COMMON.INVENTION]: 'Stake/Pre-Purchase to Earn Royalties',
      [COMMON.PROBLEM]: 'Solve to Earn Royalties',
      [COMMON.SOLUTION]: 'Improve to Earn Royalties',
      [COMMON.CONTEST]: 'Win to Earn a Royalty Jackpot',
      default: '',
    };
    const watermarkText = watermarkTexts[itemType] || watermarkTexts.default;

    let audioInText = '';
    let audio = null;
    const audioFilePath = path.join(
      backendRoot,
      `generated_audio_${itemId}.mp3`,
    );
    if (audioBlob) {
      audio = await saveAudioBlobAsMP3(audioBlob, audioFilePath);
      audioInText = await transcribeAudio(audioFilePath);
    } else {
      const audioPrompt = await generateAudioPrompt(item, itemType);
      const audioResponse = await openAi.getAnswer(
        audioPrompt,
        DEFAULT_AI_ANS_LENGTH,
        user.id,
        creditsHistory,
      );
      audioInText = await openAi.getAnswer(
        audioResponse,
        DEFAULT_AI_ANS_LENGTH,
        user.id,
        creditsHistory,
      );
      audio = await generateAudio(audioInText, audioFilePath);
    }
    const outputPath = path.join(backendRoot, `generated_video_${itemId}.mp4`);
    const generatedVideo = await generateGoogleVideo(videoPrompt, outputPath);
    const captions = await generateCaptions(audioInText);
    const captionsFilePath = path.join(backendRoot, `captions_${itemId}.srt`);
    fs.writeFileSync(captionsFilePath, captions);
    const outputFilePath = path.join(
      backendRoot,
      `output_combined_video_${itemId}.mp4`,
    );
    const outputWithCaptionsPath = path.join(
      backendRoot,
      `output_with_captions_${itemId}.mp4`,
    );
    const outputWatermarkedPath = path.join(
      backendRoot,
      `output_with_captions_watermarked_${itemId}.mp4`,
    );
    const watermarkPath = path.join(backendRoot, 'mindminer.png');
    await addMindMinerWatermark(
      watermarkText,
      watermarkPath,
      generatedVideo[0],
      outputWatermarkedPath,
    );
    await combineAudioAndVideo(audio, outputWatermarkedPath, outputFilePath);
    await addCaptionsToVideo(
      outputFilePath,
      captionsFilePath,
      outputWithCaptionsPath,
    );

    const fileBuffer = fs.readFileSync(outputWithCaptionsPath);
    const s3VideoUrl = await s3Files.uploadFileToS3(
      fileBuffer,
      `${itemId}_generated_video_${Date.now()}.mp4`,
      'videos/',
      'video/mp4',
    );

    await updateItemVideoStatus(
      itemType,
      itemId,
      { videoUrl: s3VideoUrl, videoIsProcessing: false },
      user,
    );

    pusher.trigger(CHANNELS.VIDEO_GENERATION_CHANNEL, COMMON.VIDEOS, {
      message: 'Video Generated',
    });
    await subtractCredits(
      user.id,
      Number(process.env.GEN_VIDEO_COST),
      creditsHistory,
      null,
      GENERATION_TYPES.VIDEO,
    );
    await triggerCreditsPusher(creditsHistory._id, user.id);
  } catch (err) {
    pusher.trigger(CHANNELS.VIDEO_GENERATION_CHANNEL, COMMON.VIDEOS, {
      message: 'Video Generation Failed!',
    });
    await updateItemVideoStatus(
      itemType,
      itemId,
      { videoIsProcessing: false },
      user,
    );
    throw err;
  } finally {
    deleteTempFiles(itemId);
  }
}
