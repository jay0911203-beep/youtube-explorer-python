
import json
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound

def handler(event, context):
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
    }

    if event['httpMethod'] == 'OPTIONS':
        return {'statusCode': 200, 'headers': headers, 'body': ''}

    params = event.get('queryStringParameters', {})
    video_id = params.get('videoId')

    if not video_id:
        return {
            'statusCode': 400,
            'headers': headers,
            'body': json.dumps({'error': 'Video ID is required'})
        }

    try:
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        try:
            transcript = transcript_list.find_transcript(['ko'])
        except:
            try:
                transcript = transcript_list.find_transcript(['en'])
            except:
                transcript = transcript_list.find_generated_transcript(['ko', 'en'])

        data = transcript.fetch()
        full_text = " ".join([item['text'] for item in data])
        full_text = full_text.replace('\n', ' ').replace('  ', ' ')

        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'success': True,
                'transcript': full_text,
                'lang': transcript.language_code,
                'is_generated': transcript.is_generated
            })
        }

    except (TranscriptsDisabled, NoTranscriptFound):
        return {
            'statusCode': 404,
            'headers': headers,
            'body': json.dumps({'success': False, 'error': 'No captions found'})
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'success': False, 'error': str(e)})
        }
