
import json
import sys
import os

# 라이브러리 경로 설정 (Netlify 환경)
try:
    sys.path.append(os.path.join(os.path.dirname(__file__), "node_modules"))
    from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound
except ImportError:
    YouTubeTranscriptApi = None

def handler(event, context):
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
    }

    if event['httpMethod'] == 'OPTIONS':
        return {'statusCode': 200, 'headers': headers, 'body': ''}

    video_id = event.get('queryStringParameters', {}).get('videoId')

    if not video_id:
        return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Video ID required'})}

    if not YouTubeTranscriptApi:
         return {'statusCode': 500, 'headers': headers, 'body': json.dumps({'error': 'Server config error'})}

    try:
        # 1. 자막 리스트 조회
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        
        # 2. 우선순위: 한국어 -> 영어 -> 자동생성
        try:
            transcript = transcript_list.find_transcript(['ko'])
        except:
            try:
                transcript = transcript_list.find_transcript(['en'])
            except:
                transcript = transcript_list.find_generated_transcript(['ko', 'en'])

        # 3. 데이터 가져오기
        data = transcript.fetch()
        full_text = " ".join([item['text'] for item in data])
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'success': True, 
                'transcript': full_text.replace('\n', ' '), 
                'lang': transcript.language_code
            })
        }

    except Exception as e:
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'success': False, 'error': str(e)})
        }
