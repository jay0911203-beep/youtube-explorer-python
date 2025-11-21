
import json
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound

def handler(event, context):
    # CORS Headers
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
        # 1. 자막 리스트 가져오기
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)

        # 2. 언어 우선순위 설정 (한국어 -> 영어 -> 자동생성)
        try:
            transcript = transcript_list.find_transcript(['ko'])
        except:
            try:
                transcript = transcript_list.find_transcript(['en'])
            except:
                # 마지막 수단: 자동생성 포함
                transcript = transcript_list.find_generated_transcript(['ko', 'en'])

        # 3. 자막 데이터 가져오기
        data = transcript.fetch()
        
        # 4. 텍스트 합치기
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
            'body': json.dumps({'success': False, 'error': '이 영상에는 자막이 없습니다.'})
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'success': False, 'error': str(e)})
        }
